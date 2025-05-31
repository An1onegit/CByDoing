document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const exerciseTitleEl = document.getElementById('exercise-title');
    const exerciseDescriptionEl = document.getElementById('exercise-description');
    const starterCodeAreaEl = document.getElementById('starter-code-area');
    const exerciseStarterCodeEl = document.getElementById('exercise-starter-code');
    const exerciseListUl = document.getElementById('exercise-list-ul');
    const submitButton = document.getElementById('submit-button');
    const resetCodeButton = document.getElementById('reset-code-button');
    const loadingSpinnerEl = document.getElementById('loading-spinner');
    const showSolutionButton = document.getElementById('show-solution-button');
    const outputDisplayEl = document.getElementById('output-display');
    const solutionDisplayAreaEl = document.getElementById('solution-display-area');
    const modelSolutionCodeEl = document.getElementById('model-solution-code');
    const copySolutionButton = document.getElementById('copy-solution-button');
    const prevExerciseButton = document.getElementById('prev-exercise');
    const nextExerciseButton = document.getElementById('next-exercise');
    const currentExerciseIndicatorEl = document.getElementById('current-exercise-indicator');

    let aceEditor;
    let exercises = []; // Will be populated by fetching exercises.json
    let currentExerciseIndex = 0;
    let completedExercises = {};
    let userCodeCache = {};

    // NEW: Functions for caching user code
    function loadUserCodeCache() {
        const stored = localStorage.getItem('userCodeCacheCExercises');
        if (stored) {
            try {
                userCodeCache = JSON.parse(stored);
                if (typeof userCodeCache !== 'object' || userCodeCache === null) {
                    userCodeCache = {};
                }
            } catch (e) {
                console.error("Error parsing userCodeCache from localStorage:", e);
                userCodeCache = {};
            }
        }
    }
    
    function saveUserCodeForExercise(exerciseId, code) {
        if (exerciseId) {
            userCodeCache[exerciseId] = code;
            localStorage.setItem('userCodeCacheCExercises', JSON.stringify(userCodeCache));
        }
    }

    function getUserCodeForExercise(exerciseId) {
        return exerciseId ? userCodeCache[exerciseId] : null;
    }
    // --- LOCAL STORAGE FUNCTIONS ---
    function loadCompletedStatus() {
        const stored = localStorage.getItem('completedCExercises');
        if (stored) {
            try {
                completedExercises = JSON.parse(stored);
                if (typeof completedExercises !== 'object' || completedExercises === null) {
                    completedExercises = {}; // Reset if not a valid object
                }
            } catch (e) {
                console.error("Error parsing completed exercises from localStorage:", e);
                completedExercises = {};
            }
        }
    }

    function saveCompletedStatus() {
        localStorage.setItem('completedCExercises', JSON.stringify(completedExercises));
    }

    function markExerciseAsCompleted(exerciseId) {
        if (exerciseId) {
            completedExercises[exerciseId] = true;
            saveCompletedStatus();
            populateExerciseList();
        }
    }

    // --- ACE EDITOR INIT ---
    function initializeAceEditor() {
        aceEditor = ace.edit("code-editor-container");
        aceEditor.setTheme("ace/theme/monokai");
        aceEditor.session.setMode("ace/mode/c_cpp");
        aceEditor.setOptions({
            fontSize: "14px",
            showPrintMargin: false,
            useWorker: false
        });

        // NEW: Save code on change
        aceEditor.session.on('change', () => {
            if (exercises && exercises.length > 0 && exercises[currentExerciseIndex]) {
                const currentExerciseId = exercises[currentExerciseIndex].id;
                if (currentExerciseId) {
                    saveUserCodeForExercise(currentExerciseId, aceEditor.getValue());
                }
            }
        });
    }

    // --- POPULATE EXERCISE LIST IN SIDEBAR ---
    function populateExerciseList() {
        exerciseListUl.innerHTML = '';
        if (!exercises || exercises.length === 0) {
            console.log("No exercises to populate in sidebar.");
            return;
        }

        exercises.forEach((exercise, index) => {
            if (!exercise || typeof exercise.title === 'undefined') {
                console.warn("Skipping invalid exercise object during list population:", exercise);
                return; // Skip this malformed exercise object
            }
            const listItem = document.createElement('li');
            listItem.textContent = exercise.title;
            listItem.dataset.index = index;

            if (index === currentExerciseIndex) {
                listItem.classList.add('active-exercise');
            }
            if (exercise.id && completedExercises[exercise.id]) {
                listItem.classList.add('completed-exercise');
            }

            listItem.addEventListener('click', () => {
                currentExerciseIndex = parseInt(listItem.dataset.index);
                displayExercise(currentExerciseIndex);
                updateNavigation();
                populateExerciseList(); // Re-populate to update active class
            });
            exerciseListUl.appendChild(listItem);
        });
    }

    // --- Load Exercises from JSON file ---
    async function loadExercises() {
        console.log("Attempting to load exercises from exercises.json...");
        loadCompletedStatus(); // Load completion status first
        loadUserCodeCache();

        try {
            const response = await fetch('exercises.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} while fetching exercises.json`);
            }
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                exercises = data; // Assign fetched data
                console.log("Successfully loaded exercises:", exercises.length, "found.");
                populateExerciseList();
                displayExercise(currentExerciseIndex);
                updateNavigation();
            } else {
                throw new Error("No exercises found in exercises.json or data is not an array.");
            }
        } catch (error) {
            console.error("Could not load exercises from exercises.json:", error);
            exerciseTitleEl.textContent = "Error loading exercises.";
            outputDisplayEl.innerHTML = `<p>Failed to load exercises.json: ${escapeHtml(error.message)}. Please ensure the file exists and is valid JSON.</p>`;
            exercises = []; // Ensure exercises is an empty array on failure
            populateExerciseList(); // Still try to populate (will be empty)
            updateNavigation();     // Update nav for empty state
        }
    }

    // --- Display Exercise ---
    function displayExercise(index) {
        if (!exercises || exercises.length === 0 || index < 0 || index >= exercises.length) {
            console.error("Cannot display exercise: Invalid index or no exercises loaded.", index, exercises.length);
            exerciseTitleEl.textContent = "No Exercise Selected";
            exerciseDescriptionEl.innerHTML = "<p>Please select an exercise from the list.</p>";
            if(aceEditor) aceEditor.setValue("", -1);
            starterCodeAreaEl.style.display = 'none';
            return;
        }

        const exercise = exercises[index];
        if (!exercise || typeof exercise.title === 'undefined') {
            console.error("Attempting to display invalid exercise object at index:", index, exercise);
            exerciseTitleEl.textContent = "Error: Invalid exercise data.";
            if(aceEditor) aceEditor.setValue("", -1);
            return;
        }

        exerciseTitleEl.textContent = exercise.title;
        exerciseDescriptionEl.innerHTML = exercise.description ? exercise.description.replace(/\n/g, '<br>') : "No description available.";

        let codeToDisplay = getUserCodeForExercise(exercise.id);
        if (codeToDisplay === null || typeof codeToDisplay === 'undefined') { // No cached code or explicit null
            codeToDisplay = exercise.starter_code || `// Solution for: ${exercise.title}\n#include <stdio.h>\n\nint main() {\n    // Your code here\n\n    return 0;\n}`;
        }  

        if (aceEditor) {
            aceEditor.setValue(codeToDisplay, -1);
            aceEditor.session.getUndoManager().reset(); // Reset undo only if it's fresh starter/cached code
            aceEditor.focus();
        }

        // Display static starter code snippet (for reference)
        if (exercise.starter_code && exercise.starter_code.trim() !== "") {
            exerciseStarterCodeEl.textContent = exercise.starter_code;
            starterCodeAreaEl.style.display = 'block';
        } else {
            starterCodeAreaEl.style.display = 'none';
            exerciseStarterCodeEl.textContent = '';
        }
        
        outputDisplayEl.innerHTML = "<p>Enter your solution and click 'Run Code' to see the output.</p>";
        solutionDisplayAreaEl.style.display = 'none';
        showSolutionButton.style.display = 'inline-block';
        showSolutionButton.textContent = 'Show Solution';
        submitButton.disabled = false;
        resetCodeButton.disabled = false;
    }

    // --- Navigation ---
    function updateNavigation() {
        if (!exercises || exercises.length === 0) {
            currentExerciseIndicatorEl.textContent = "0 / 0";
            prevExerciseButton.disabled = true;
            nextExerciseButton.disabled = true;
            return;
        }
        currentExerciseIndicatorEl.textContent = `${currentExerciseIndex + 1} / ${exercises.length}`;
        prevExerciseButton.disabled = currentExerciseIndex === 0;
        nextExerciseButton.disabled = currentExerciseIndex === exercises.length - 1;
    }

    prevExerciseButton.addEventListener('click', () => {
        if (currentExerciseIndex > 0) {
            currentExerciseIndex--;
            displayExercise(currentExerciseIndex);
            updateNavigation();
            populateExerciseList();
        }
    });

    nextExerciseButton.addEventListener('click', () => {
        if (currentExerciseIndex < exercises.length - 1) {
            currentExerciseIndex++;
            displayExercise(currentExerciseIndex);
            updateNavigation();
            populateExerciseList();
        }
    });

    // --- Handle Code Submission ---
    submitButton.addEventListener('click', async (e) => {
        e.preventDefault();
        console.log("Submit button clicked, async function starting.");
        
        loadingSpinnerEl.style.display = 'inline';
        submitButton.disabled = true;
        resetCodeButton.disabled = true;
        outputDisplayEl.innerHTML = "<p>⏳ Processing your code...</p>";

        if (!exercises || exercises.length === 0 || !exercises[currentExerciseIndex] || !aceEditor) {
            outputDisplayEl.innerHTML = "<p>Error: Exercises not loaded, invalid index, or editor not ready.</p>";
            loadingSpinnerEl.style.display = 'none';
            submitButton.disabled = false;
            resetCodeButton.disabled = false;
            return;
        }
        const userCode = aceEditor.getValue();
        const currentExercise = exercises[currentExerciseIndex];
        const exerciseId = currentExercise.id;

        if (!exerciseId) {
             outputDisplayEl.innerHTML = "<p>Error: Current exercise is missing an ID.</p>";
            loadingSpinnerEl.style.display = 'none';
            submitButton.disabled = false;
            resetCodeButton.disabled = false;
            return;
        }

        try {
            console.log("TRY_BLOCK_START: Attempting fetch to /run_code");

            const response = await fetch('http://127.0.0.1:5001/run_code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', },
                body: JSON.stringify({ code: userCode, exercise_id: exerciseId }),
            });

            console.log("FETCH_RESPONSE_RECEIVED: Status:", response.status, "ok:", response.ok);

            if (!response.ok) {
                console.error("FETCH_NOT_OK: Response was not OK. Status:", response.status);
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorText = await response.text();
                    console.log("FETCH_ERROR_TEXT_FROM_BACKEND:", errorText);
                    try {
                        const errorData = JSON.parse(errorText);
                        errorMsg += ` - ${errorData.message || errorText || 'No additional error info.'}`;
                    } catch (jsonParseError) {
                        errorMsg += ` - Server response (not JSON): ${errorText.substring(0, 200)}...`;
                    }
                } catch (textReadError) {
                    console.error("FETCH_ERROR_COULD_NOT_READ_TEXT:", textReadError);
                    errorMsg += ` - Could not read error response body.`;
                }
                outputDisplayEl.innerHTML = `<p>Error submitting code: ${escapeHtml(errorMsg)}</p>`;
                return; // Return here, finally block will still execute
            }

            console.log("FETCH_SUCCESSFUL_OK: Backend should have processed. Response object:", response);

            const result = await response.json();
            console.log("JSON_RESULT_FROM_BACKEND:", result);
            displayResults(result);

            if (result.status === "ALL_PASSED") {
                markExerciseAsCompleted(exerciseId);
            }
            
        } catch (error) {
            console.error('CATCH_BLOCK_ERROR:', error.name, error.message, error.stack ? error.stack.split('\n')[0] : 'No stack');
            outputDisplayEl.innerHTML = `<p>Catastrophic error: ${escapeHtml(error.message)}</p>`;
        } finally {
            loadingSpinnerEl.style.display = 'none';
            submitButton.disabled = false;
            resetCodeButton.disabled = false;
        }
    });

    // --- Reset Code Button ---
    resetCodeButton.addEventListener('click', () => {
        if (!exercises || exercises.length === 0 || !exercises[currentExerciseIndex] || !aceEditor) return;

        // NEW: Add confirmation
        if (confirm("Are you sure you want to reset your code to the starter template? Your current changes will be lost.")) {
            const currentExercise = exercises[currentExerciseIndex];
            const starter = currentExercise.starter_code || `// Solution for: ${currentExercise.title}\n#include <stdio.h>\n\nint main() {\n    // Your code here\n\n    return 0;\n}`;
            
            aceEditor.setValue(starter, -1);
            aceEditor.session.getUndoManager().reset();
            aceEditor.focus();

            // Also clear cached code for this exercise when user explicitly resets
            if (currentExercise.id) {
                saveUserCodeForExercise(currentExercise.id, starter); 
            }
            outputDisplayEl.innerHTML = "<p>Code has been reset to starter template. Click 'Run Code' to test.</p>";
        } else {
            // User clicked "Cancel" on the confirmation
            console.log("Code reset cancelled by user.");
        }
    });

    // --- Display Results from Backend ---
    function displayResults(result) {
        if (!result || typeof result.status === 'undefined') {
            console.error("Invalid result object received from backend:", result);
            outputDisplayEl.innerHTML = "<p>Error: Received invalid result format from the server.</p>";
            return;
        }
        // ... (rest of displayResults is the same as your last working version) ...
        let htmlOutput = `<h3>Overall Status: <span class="status-${result.status.toLowerCase().replace(/_/g, '-')}">${result.status.replace(/_/g, ' ')}</span></h3>`;

        if (result.status === "COMPILATION_ERROR" && result.message) {
            htmlOutput += `<h4>Compilation Message:</h4><pre>${escapeHtml(result.message)}</pre>`;
        } else if (result.compile_message && result.status !== "ALL_PASSED" && result.status !== "FAILED_TESTS" && result.status !== "SUCCESS_DUMMY_HANDLER") {
            htmlOutput += `<h4>Compilation Message:</h4><pre>${escapeHtml(result.compile_message)}</pre>`;
        }

        if (result.results && Array.isArray(result.results) && result.results.length > 0) {
            htmlOutput += '<h4>Test Case Results:</h4>';
            htmlOutput += '<table><thead><tr><th>Test Case</th><th>Status</th><th>Input</th><th>Expected</th><th>Actual / Error</th></tr></thead><tbody>';
            result.results.forEach(tc => {
                let actualContent = tc.actual_output || '';
                if (tc.status === "RUNTIME_ERROR" || tc.status === "TIMEOUT" || tc.status === "COMPILATION_ERROR") {
                    if (tc.error_details) {
                        actualContent = tc.error_details;
                    } else if (tc.status === "COMPILATION_ERROR" && result.message) {
                         actualContent = result.message;
                    }
                }
                htmlOutput += `<tr>
                    <td>${tc.test_case}</td>
                    <td class="status-${tc.status.toLowerCase().replace(/_/g, '-')}">${tc.status.replace(/_/g, ' ')}</td>
                    <td><pre>${escapeHtml(tc.input)}</pre></td>
                    <td><pre>${escapeHtml(tc.expected_output)}</pre></td>
                    <td><pre>${escapeHtml(actualContent)}</pre></td>
                </tr>`;
            });
            htmlOutput += '</tbody></table>';
        } else if (result.status === "SUCCESS_DUMMY_HANDLER" && result.echoed_data) {
             htmlOutput += `<h4>Dummy Handler Echo:</h4><pre>${escapeHtml(JSON.stringify(result.echoed_data, null, 2))}</pre>`;
        }
        outputDisplayEl.innerHTML = htmlOutput;
    }

    // --- Show Solution ---
    showSolutionButton.addEventListener('click', () => {
        if (!exercises || exercises.length === 0 || !exercises[currentExerciseIndex]) return;
        const currentExercise = exercises[currentExerciseIndex];
        if (solutionDisplayAreaEl.style.display === 'none') {
            const solution = currentExercise.model_solution;
            if (solution) {
                modelSolutionCodeEl.textContent = solution;
                solutionDisplayAreaEl.style.display = 'block';
                showSolutionButton.textContent = 'Hide Solution';
            } else {
                modelSolutionCodeEl.textContent = "No model solution available for this exercise.";
                solutionDisplayAreaEl.style.display = 'block';
            }
        } else {
            solutionDisplayAreaEl.style.display = 'none';
            showSolutionButton.textContent = 'Show Solution';
        }
    });

    // NEW: Copy Solution Button Handler
    copySolutionButton.addEventListener('click', () => {
        if (!exercises || exercises.length === 0 || !exercises[currentExerciseIndex]) return;
        const currentExercise = exercises[currentExerciseIndex];
        const solutionCode = currentExercise.model_solution;

        if (solutionCode && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(solutionCode).then(() => {
                copySolutionButton.textContent = 'Copied!';
                copySolutionButton.classList.add('copied');
                setTimeout(() => {
                    copySolutionButton.textContent = 'Copy';
                    copySolutionButton.classList.remove('copied');
                }, 2000); // Reset button text after 2 seconds
            }).catch(err => {
                console.error('Failed to copy solution code: ', err);
                alert('Failed to copy code. Your browser might not support this feature or permissions are denied.');
            });
        } else if (solutionCode) { // Fallback for older browsers (less reliable)
            const textArea = document.createElement("textarea");
            textArea.value = solutionCode;
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                copySolutionButton.textContent = 'Copied!';
                copySolutionButton.classList.add('copied');
                setTimeout(() => {
                    copySolutionButton.textContent = 'Copy';
                    copySolutionButton.classList.remove('copied');
                }, 2000);
            } catch (err) {
                console.error('Fallback copy failed: ', err);
                alert('Failed to copy code.');
            }
            document.body.removeChild(textArea);
        } else {
            alert('No solution code to copy.');
        }
    });
    
    // --- Helper to escape HTML ---
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            if (unsafe === null || typeof unsafe === 'undefined') return '';
            return String(unsafe); 
        }
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, "&quot")
             .replace(/'/g, "'"); 
    }

    // Initial Load
    initializeAceEditor();
    loadExercises(); // This will now fetch exercises.json
});