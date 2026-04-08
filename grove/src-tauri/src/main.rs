// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(exit_code) = grove::run_internal_cli_if_requested() {
        std::process::exit(exit_code);
    }
    grove::run()
}
