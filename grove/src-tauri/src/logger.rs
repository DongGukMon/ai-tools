/// Debug-only log macros. Calls are compiled out entirely in release builds.

#[derive(Clone, serde::Serialize)]
pub struct LogPayload {
    pub level: &'static str,
    pub tag: String,
    pub message: String,
}

macro_rules! log_emit {
    ($level:expr, $tag:expr, $msg:expr) => {
        crate::eventbus::emit(
            "grove:log",
            crate::logger::LogPayload {
                level: $level,
                tag: $tag.to_string(),
                message: $msg.to_string(),
            },
        );
        eprintln!("[grove:{}] [{}] {}", $tag, $level, $msg);
    };
}

#[allow(unused_macros)]
macro_rules! grove_info {
    ($tag:expr, $msg:expr) => {
        #[cfg(debug_assertions)]
        {
            $crate::logger::log_emit!("info", $tag, $msg);
        }
    };
}

#[allow(unused_macros)]
macro_rules! grove_warn {
    ($tag:expr, $msg:expr) => {
        #[cfg(debug_assertions)]
        {
            $crate::logger::log_emit!("warn", $tag, $msg);
        }
    };
}

#[allow(unused_macros)]
macro_rules! grove_error {
    ($tag:expr, $msg:expr) => {
        $crate::logger::log_emit!("error", $tag, $msg);
    };
}

#[allow(unused_imports)]
pub(crate) use grove_error;
#[allow(unused_imports)]
pub(crate) use grove_info;
#[allow(unused_imports)]
pub(crate) use grove_warn;
#[allow(unused_imports)]
pub(crate) use log_emit;
