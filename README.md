# 🧠 C Practice Platform

A web-based interactive C programming practice environment. Users can browse exercises, write and run C code in-browser, get instant feedback on their solutions, and track progress — all powered by Docker and Flask.

---

## 🚀 Project Goal

Build a self-contained, educational C coding platform where users can:

* View curated exercises.
* Write and run C code directly in the browser.
* Get compilation and test results immediately.
* See model solutions and track completed problems.

---

## 🛠️ Tech Stack

### 🔹 Frontend

* **HTML/CSS/JavaScript**
* **Ace Editor**: Embedded code editor with syntax highlighting.
* **LocalStorage**: Persists user code and completion status.
* **Served via**: `python -m http.server 5500`

### 🔹 Backend

* **Python Flask**
* **Docker** (via `subprocess.run`) for isolated compilation/execution.
* **flask-cors**: CORS configuration to support local frontend.

---

## 📋 Features

### 🔧 Code Execution

* Submissions sent to a `/run_code` endpoint.
* Code compiled using Docker (`gcc:latest`) and executed with test inputs.
* Handles:

  * Compilation errors
  * Runtime errors
  * Timeouts
  * Test case validation

### 🧪 Test Feedback

* Output area shows:

  * **Overall status** (`ALL_PASSED`, `COMPILATION_ERROR`, etc.)
  * Table of test case results: input, expected, actual, status

### 🖥️ UI Overview

* **Sidebar**: Lists exercises with completion checkmarks
* **Main Area**: Displays:

  * Title, description, and starter code
  * Ace Editor for user input
  * Buttons: Run Code, Reset Code, Show Solution, Copy Solution
* **Output Panel**: Shows status and result details
* **Persistent Progress**: Saves user input and completion per exercise

### ⚙️ Dev Tools

* `/ping` route for backend health check
* Console logs in `script.js` for debugging JSON fetch/load
* Print debugging in backend for Docker execution pipeline

---

## 📁 Project Structure

```
📦 root/
├── index.html
├── style.css
├── script.js
├── exercises.json
├── app.py (Flask backend)
└── README.md
```

---

## 🧩 exercises.json Format

Each exercise object contains:

```json
{
  "id": "ex1",
  "title": "Print Hello",
  "description": "Write a program that prints Hello, World!",
  "starter_code": "#include <stdio.h>\nint main() {\n    // your code here\n}",
  "test_cases": [
    { "input": "", "expected_output": "Hello, World!\n" }
  ],
  "model_solution": "#include <stdio.h>\nint main() {\n    printf(\"Hello, World!\\n\");\n    return 0;\n}"
}
```

---

## 🧪 Running Locally

### 1. Clone the repo

```bash
git clone https://github.com/your-username/c-practice-platform.git
cd c-practice-platform
```

### 2. Start Backend

Ensure Docker is running. Then:

```bash
pip install flask flask-cors
python app.py
```

### 3. Start Frontend

In a new terminal:

```bash
python -m http.server 5500
```

Navigate to: [http://localhost:5500](http://localhost:5500)

---

## ✅ Current Progress

* [x] Basic frontend layout with Ace Editor
* [x] JSON-based dynamic exercise loading
* [x] Code submission to Dockerized backend
* [x] Compilation + test execution + result display
* [x] Local storage of code + completion
* [x] Network/CORS and Docker reliability fixes
* [ ] Add Exercises 3–7 from Tutorial PDF
* [ ] Light/Dark theme toggle
* [ ] Font size control for editor
* [ ] Exercise categories and difficulty levels
* [ ] "Copy Starter Code" button
* [ ] Enhanced error messaging from stderr

---

## 🐞 Troubleshooting

* **Page reloads**: Avoid VS Code Live Server. Use `python -m http.server`.
* **CORS errors**: Ensure Flask CORS origins match frontend host.
* **Docker not responding**: Restart Docker Desktop before backend.
