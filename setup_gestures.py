import json
import os

CONFIG_FILE = 'config.json'

DEFAULT_CONFIG = {
    "3_finger_tap": ["playpause"],
    "3_finger_up": ["volumeup"],
    "3_finger_down": ["volumedown"],
    "3_finger_left": ["alt", "shift", "tab"],
    "3_finger_right": ["alt", "tab"],
    "4_finger_tap": ["win", "a"],
    "4_finger_up": ["win", "tab"],
    "4_finger_down": ["win", "d"],
    "4_finger_left": ["win", "ctrl", "right"],
    "4_finger_right": ["win", "ctrl", "left"]
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            saved_config = json.load(f)
            
            # Find any missing keys (like the new 4-finger ones) and add them
            needs_update = False
            for key in DEFAULT_CONFIG:
                if key not in saved_config:
                    saved_config[key] = DEFAULT_CONFIG[key]
                    needs_update = True
            
            # Save the updated file behind the scenes
            if needs_update:
                save_config(saved_config)
                
            return saved_config
            
    return DEFAULT_CONFIG.copy()

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)
    print("\n✅ Configuration saved to config.json!")

def main():
    config = load_config()
    
    while True:
        print("\n--- Gesture Configuration Menu ---")
        keys = list(config.keys())
        for i, key in enumerate(keys):
            print(f"{i + 1}. {key} -> {' + '.join(config[key])}")
        print(f"{len(keys) + 1}. Save and Exit")
        
        choice = input("\nSelect a gesture to change (or exit): ")
        
        try:
            choice_idx = int(choice) - 1
            if choice_idx == len(keys):
                save_config(config)
                break
            
            selected_gesture = keys[choice_idx]
            print(f"\nEditing: {selected_gesture}")
            print("Enter the new keys separated by spaces (e.g., 'win d' or 'alt tab' or 'ctrl c').")
            new_keys_input = input("New keys: ").strip().lower()
            
            if new_keys_input:
                config[selected_gesture] = new_keys_input.split()
                print(f"Updated {selected_gesture} to: {' + '.join(config[selected_gesture])}")
            else:
                print("No changes made.")
        except Exception:
            print("Invalid input.")

if __name__ == "__main__":
    main()