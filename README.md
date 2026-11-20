# Windows Remote Touchpad

A modular, highly polished remote touchpad and keyboard for Windows, built with Python, Flask, and WebSockets.

## Features
* **Zero-Lag Input:** Uses WebSockets for real-time cursor tracking.
* **Windows Gestures:** Maps 2, 3, and 4-finger swipes to native Windows shortcuts (Task View, Virtual Desktops, Alt-Tab).
* **Physics-Based UI:** Features critically damped spring animations for menus and buttons.
* **Instant Pairing:** Generates a QR code in the terminal on startup for instant phone connection.
* **Wake Lock:** Prevents the mobile browser from sleeping while in use.

## How to Run
1. Install dependencies: `pip install -r requirements.txt`
2. Run the server: `python app.py`
3. Scan the QR code in your terminal with your phone.
