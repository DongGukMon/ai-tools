use std::io::Read;
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

pub trait UrlOpenSink: Send + Sync + 'static {
    fn on_url(&self, url: &str);
}

pub fn socket_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grove")
        .join("open-url.sock")
}

pub fn start(sink: Arc<dyn UrlOpenSink>) {
    let path = socket_path();
    let _ = std::fs::remove_file(&path);

    let listener = match UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("grove: failed to bind open-url socket: {e}");
            return;
        }
    };

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let mut buf = String::new();
                if stream.read_to_string(&mut buf).is_ok() {
                    let url = buf.trim();
                    if !url.is_empty() {
                        sink.on_url(url);
                    }
                }
            }
        }
    });
}

pub fn cleanup() {
    let _ = std::fs::remove_file(socket_path());
}
