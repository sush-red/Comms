Comms Pro
A lightweight, real-time team communication and scheduling platform. Built for simplicity and speed, Comms Pro features live chat, role-based access control, direct messaging, and a fully integrated calendar with a smart scheduling assistant.

✨ Key Features
Real-Time Chat: Instant messaging across global channels, custom groups, and 1-on-1 direct messages.

Role-Based Access: Three distinct tiers (Standard User, Project Admin, Central Admin) governing channel creation and member management.

Interactive Calendar: Integrated scheduling system with RSVP tracking, meeting overlap detection, and visual timeline plotting.

Smart Scheduling Assistant: Visual grid to seamlessly find available meeting times among multiple attendees.

Member Management: Admins can create channels, bulk-add/remove users, and promote standard users to admin roles.

Zero-Config Database: Uses a self-contained SQLite file that automatically generates on first launch.

🛠️ Tech Stack
This project is built with a "vanilla-first" approach to keep the architecture lean and easy to maintain without a complex build step.

Backend:

Node.js: Runtime environment.

Express: Web server for serving static HTML/CSS/JS files.

Socket.io: Handles the persistent, real-time WebSocket connection between the client and server.

SQLite3: Lightweight, file-based SQL database.

Frontend:

HTML5 & Vanilla JavaScript: No heavy frameworks (React/Vue). DOM manipulation is handled natively.

Tailwind CSS: Utility-first CSS framework (loaded via CDN for immediate styling).

🚀 Getting Started
Follow these steps to get the project running on your local machine.

Prerequisites
You only need to have Node.js (v14 or higher) installed on your system.

1. Clone the Repository
Open your terminal and clone the project to your local machine:

Bash
git clone <your-repository-url-here>
cd comms
2. Install Dependencies
Install the required Node packages (express, socket.io, and sqlite3):

Bash
npm install
3. Start the Server
Launch the Node server:

Bash
node server.js
Note: You should see a message in the terminal saying Connected to SQLite Database. followed by Server listening on http://localhost:3000.

4. Open the App
Open your web browser and navigate to:

Plaintext
http://localhost:3000
📁 Folder Structure
Plaintext
comms/
│
├── server.js          # The Node.js server, Socket.io event listeners, and SQLite queries.
├── package.json       # Node dependency list and project metadata.
├── chat.db            # Auto-generated SQLite database (Do not commit to version control).
│
└── public/            # Static files served to the browser
    ├── index.html     # The main UI structure and Tailwind CDN configuration.
    ├── app.js         # Client-side logic, DOM manipulation, and UI state management.
    └── style.css      # Custom scrollbars and specific UI tweaks.
💡 Developer Notes
Database Initialization
You do not need to manually set up a database. On the very first run, server.js will automatically create the chat.db file and execute the CREATE TABLE commands for messages, users, custom channels, and calendar events.

Testing Roles Locally
To test the different permission layers, open multiple browser tabs (or use Incognito mode) pointing to http://localhost:3000.

Log into one tab as a Project Admin (to create channels and manage users).

Log into the second tab as a Standard User (to test restrictions, DMs, and group creation).
