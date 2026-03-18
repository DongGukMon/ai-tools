use std::sync::{Arc, OnceLock};

/// Debug-only log macros. Calls are compiled out entirely in release builds.

pub trait LogEventSink: Send + Sync + 'static {
    fn on_log(&self, level: &str, tag: &str, message: &str);
}

fn sink() -> &'static OnceLock<Arc<dyn LogEventSink>> {
    static LOG_SINK: OnceLock<Arc<dyn LogEventSink>> = OnceLock::new();
    &LOG_SINK
}

pub fn set_log_sink(log_sink: Arc<dyn LogEventSink>) {
    let _ = sink().set(log_sink);
}

pub fn emit_log(level: &str, tag: &str, message: &str) {
    if let Some(log_sink) = sink().get() {
        log_sink.on_log(level, tag, message);
    }

    eprintln!("[grove:{}] [{}] {}", tag, level, message);
}

#[allow(unused_macros)]
macro_rules! log_emit {
    ($level:expr, $tag:expr, $msg:expr) => {
        $crate::logger::emit_log($level, $tag, $msg);
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
