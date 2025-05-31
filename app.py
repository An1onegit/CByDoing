from flask import Flask, request, jsonify
import subprocess
import os
import shutil
import json
import uuid
from flask_cors import CORS

app = Flask(__name__)
# Using the specific CORS configuration that worked with the dummy handler
CORS(app, resources={r"/run_code": {"origins": ["http://127.0.0.1:5500", "http://localhost:5500"]}})

# Load exercises data once when the server starts
EXERCISES_FILE = 'exercises.json'
exercises_data = {}

def load_exercise_data():
    global exercises_data
    try:
        with open(EXERCISES_FILE, 'r') as f:
            loaded_exercises = json.load(f)
            for ex in loaded_exercises:
                exercises_data[ex['id']] = ex
        print(f"Loaded {len(exercises_data)} exercises from {EXERCISES_FILE}")
    except FileNotFoundError:
        print(f"Error: {EXERCISES_FILE} not found.")
        exercises_data = {} # Ensure it's an empty dict if file not found
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {EXERCISES_FILE}.")
        exercises_data = {} # Ensure it's an empty dict on decode error

def compile_c_code(code_path, output_exe_path, temp_dir):
    abs_temp_dir = os.path.abspath(temp_dir)
    # Ensure the output executable path is just the name for the Docker command
    output_exe_name = os.path.basename(output_exe_path)
    code_file_name = os.path.basename(code_path)

    compile_command = [
        'docker', 'run', '--rm',
        '-v', f'{abs_temp_dir}:/usr/src/myapp', # Mount point in container
        '-w', '/usr/src/myapp',                # Working directory in container
        'gcc:latest',                          # Docker image
        'gcc', code_file_name, '-o', output_exe_name, '-Wall', '-std=c11', '-lm'
    ]
    print(f"--- compile_c_code ---")
    print(f"Temp dir: {abs_temp_dir}")
    print(f"Source file name in container: {code_file_name}")
    print(f"Output exe name in container: {output_exe_name}")
    print(f"Executing compile command: {' '.join(compile_command)}")
    try:
        process = subprocess.run(compile_command, capture_output=True, text=True, timeout=30)
        print(f"Compile process return code: {process.returncode}")
        print(f"Compile process stdout:\n{process.stdout}")
        print(f"Compile process stderr:\n{process.stderr}")
        if process.returncode != 0:
            return False, f"Compilation Error:\n{process.stderr if process.stderr else process.stdout}" # Return stdout if stderr is empty
        # Check if the executable was actually created on the host via the mount
        if not os.path.exists(os.path.join(abs_temp_dir, output_exe_name)): # Check on host path
            print(f"!!! COMPILE WARNING: Executable {output_exe_name} not found in {abs_temp_dir} after successful compile return code.")
            return False, "Compilation reported success, but output executable not found on host."
        return True, "Compilation Successful"
    except subprocess.TimeoutExpired:
        print("!!! Compile process TIMEOUT")
        return False, "Compilation Timeout"
    except Exception as e:
        print(f"!!! EXCEPTION in compile_c_code: {type(e).__name__} - {str(e)}")
        import traceback
        traceback.print_exc()
        return False, f"Docker compilation error: {str(e)}"

def run_c_code(executable_path_on_host, input_data, temp_dir, time_limit=5):
    abs_temp_dir = os.path.abspath(temp_dir)
    executable_name_in_container = os.path.basename(executable_path_on_host)

    run_command = [
        'docker', 'run', '--rm', '-i', 
        '-v', f'{abs_temp_dir}:/usr/src/myapp',
        '-w', '/usr/src/myapp',
        'gcc:latest', 
        f'./{executable_name_in_container}' 
    ]
    print(f"--- run_c_code ---")
    print(f"Temp dir: {abs_temp_dir}")
    print(f"Executable name in container: {executable_name_in_container}")
    print(f"Executing run command: {' '.join(run_command)}")
    print(f"Input data for run: {input_data!r}") 
    try:
        process = subprocess.run(run_command, input=input_data, capture_output=True, text=True, timeout=time_limit)
        print(f"Run process return code: {process.returncode}")
        print(f"Run process stdout:\n{process.stdout}")
        print(f"Run process stderr:\n{process.stderr}")
        
        if process.returncode != 0:
            error_message = f"Runtime Error (Exit Code: {process.returncode})"
            if process.stderr:
                error_message += f"\nStderr:\n{process.stderr}"
            if process.stdout:
                 error_message += f"\nStdout before/during error:\n{process.stdout}"
            return "RUNTIME_ERROR", error_message, process.stdout.strip() 
        
        return "SUCCESS", process.stdout.strip(), "" 
    except subprocess.TimeoutExpired:
        print("!!! Run process TIMEOUT")
        return "TIMEOUT", "Execution Timed Out ({}s)".format(time_limit), ""
    except Exception as e:
        print(f"!!! EXCEPTION in run_c_code: {type(e).__name__} - {str(e)}")
        import traceback
        traceback.print_exc()
        return "RUNTIME_ERROR", f"Docker execution error: {str(e)}", ""

@app.route('/run_code', methods=['POST'])
def handle_run_code():
    print(f"\n--- handle_run_code (FULL DOCKER LOGIC ATTEMPT) ---")
    try:
        data = request.get_json()
        if data is None:
            raw_data_check = request.data
            print(f"Request headers: {request.headers}")
            print(f"! No JSON data received. Raw data: {raw_data_check!r}")
            return jsonify({'status': 'error', 'message': 'Request body is not valid JSON or is empty.'}), 400
    except Exception as e:
        print(f"! Exception parsing JSON: {e}")
        return jsonify({'status': 'error', 'message': f'Invalid JSON in request: {e}'}), 400

    user_code = data.get('code')
    exercise_id = data.get('exercise_id')
    print(f"User code (first 100 chars): {user_code[:100]+'...' if user_code and len(user_code)>100 else user_code if user_code else 'None'}")
    print(f"Exercise ID: {exercise_id}")

    if not user_code or not exercise_id:
        print("! Missing user_code or exercise_id in JSON payload.")
        return jsonify({'status': 'error', 'message': 'Missing code or exercise_id in JSON payload'}), 400

    exercise = exercises_data.get(exercise_id)
    if not exercise:
        print(f"! Invalid exercise_id: {exercise_id}")
        return jsonify({'status': 'error', 'message': 'Invalid exercise_id'}), 400

    temp_dir_name = f"temp_code_{uuid.uuid4()}"
    temp_dir_path = os.path.join(os.getcwd(), temp_dir_name) 
    
    final_status_overall = "UNKNOWN_ERROR" # Default status
    compile_message_to_send = "Compilation not attempted or failed early."
    results_payload = []

    try:
        os.makedirs(temp_dir_path, exist_ok=True)
        print(f"Created temp directory: {temp_dir_path}")

        user_code_file_path = os.path.join(temp_dir_path, "main.c")
        executable_file_on_host = os.path.join(temp_dir_path, "main_program") 

        with open(user_code_file_path, 'w') as f:
            f.write(user_code)
        print(f"Wrote user code to: {user_code_file_path}")

        print("Attempting compilation...")
        compiled, compile_message_from_func = compile_c_code(user_code_file_path, executable_file_on_host, temp_dir_path)
        compile_message_to_send = compile_message_from_func # Update message
        print(f"Compilation done. Result: compiled={compiled}, message='{compile_message_to_send}'")

        if not compiled:
            final_status_overall = "COMPILATION_ERROR"
        else: 
            all_test_cases_passed_flag = True # Renamed for clarity
            num_test_cases = len(exercise.get('test_cases', []))
            print(f"Attempting to run against {num_test_cases} test cases...")

            if num_test_cases == 0:
                final_status_overall = "NO_TEST_CASES_DEFINED"
                results_payload.append({"test_case": 0, "status":"NO_TESTS", "input": "N/A", "expected_output": "N/A", "actual_output": "N/A"})
            else:
                for i, test_case in enumerate(exercise.get('test_cases', [])):
                    print(f"--- Running Test Case {i+1}/{num_test_cases} ---")
                    test_input = test_case.get('input', "")
                    expected_output_clean = test_case.get('expected_output', "").strip().replace('\r\n', '\n')
                    
                    run_status, actual_output_raw, run_error_details = run_c_code(executable_file_on_host, test_input, temp_dir_path)
                    actual_output_clean = actual_output_raw.strip().replace('\r\n', '\n')
                    
                    print(f"Test Case {i+1} run done. Status: {run_status}")

                    current_tc_passed = False
                    tc_result_status_for_frontend = run_status 

                    if run_status == "SUCCESS":
                        if actual_output_clean == expected_output_clean:
                            current_tc_passed = True
                            tc_result_status_for_frontend = "PASSED"
                        else:
                            tc_result_status_for_frontend = "WRONG_ANSWER"
                    
                    results_payload.append({
                        'test_case': i + 1,
                        'input': test_input if test_input else "N/A",
                        'expected_output': expected_output_clean, 
                        'actual_output': actual_output_raw, 
                        'status': tc_result_status_for_frontend,
                        'error_details': run_error_details if run_error_details else ""
                    })

                    if not current_tc_passed:
                        all_test_cases_passed_flag = False
                        print(f"Test Case {i+1} FAILED ({tc_result_status_for_frontend}). Breaking loop.")
                        break 
                    else:
                        print(f"Test Case {i+1} PASSED.")
            
                if all_test_cases_passed_flag:
                     final_status_overall = "ALL_PASSED"
                else:
                     # If not all passed, find the first non-PASSED status to report
                     for res_tc in results_payload:
                         if res_tc['status'] not in ["PASSED"]: # SUCCESS is internal to run_c_code
                             final_status_overall = res_tc['status'] 
                             break
                     if final_status_overall == "UNKNOWN_ERROR": # Should be updated by loop
                         final_status_overall = "FAILED_TESTS" # Generic fallback

        response_payload_dict = {'status': final_status_overall, 'compile_message': compile_message_to_send, 'results': results_payload}
        print(f"Sending final response: {response_payload_dict}")
        return jsonify(response_payload_dict), 200

    except Exception as e_main:
        print(f"!!! UNHANDLED EXCEPTION in main handle_run_code: {type(e_main).__name__} - {str(e_main)}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "SERVER_ERROR", "message": f"Unhandled server exception: {str(e_main)}"}), 500
    finally:
        if 'temp_dir_path' in locals() and os.path.exists(temp_dir_path):
            try:
                shutil.rmtree(temp_dir_path)
                print(f"Successfully cleaned up temp directory in finally: {temp_dir_path}")
            except Exception as e_cleanup:
                print(f"!!! Error during final cleanup of {temp_dir_path}: {e_cleanup}")


if __name__ == '__main__':
    load_exercise_data() 
    app.run(debug=True, port=5001)