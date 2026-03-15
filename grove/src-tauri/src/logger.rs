/// Debug-only log macros. Calls are compiled out entirely in release builds.

macro_rules! log_emit {
    ($level:expr, $tag:expr, $msg:expr) => {
        crate::eventbus::emit("grove:log", &serde_json::json!({
            "level": $level,
            "tag": $tag,
            "message": $msg,
        }));
        eprintln!("[grove:{}] [{}] {}", $tag, $level, $msg);
    };
}

#[allow(unused_macros)]
macro_rules! grove_info {
    ($tag:expr, $msg:expr) => {
        #[cfg(debug_assertions)]
        { log_emit!("info", $tag, $msg); }
    };
}

#[allow(unused_macros)]
macro_rules! grove_warn {
    ($tag:expr, $msg:expr) => {
        #[cfg(debug_assertions)]
        { log_emit!("warn", $tag, $msg); }
    };
}

#[allow(unused_macros)]
macro_rules! grove_error {
    ($tag:expr, $msg:expr) => {
        log_emit!("error", $tag, $msg);
    };
}

pub(crate) use grove_info;
pub(crate) use grove_warn;
pub(crate) use grove_error;
pub(crate) use log_emit;
