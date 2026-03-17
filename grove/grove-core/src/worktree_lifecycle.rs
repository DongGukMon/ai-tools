use std::sync::OnceLock;

pub trait WorktreeResource: Send + Sync {
    fn name(&self) -> &str;
    fn on_remove(&self, worktree_path: &str) -> Result<(), String>;
}

#[derive(Default)]
pub struct WorktreeLifecycle {
    resources: Vec<Box<dyn WorktreeResource>>,
}

impl WorktreeLifecycle {
    pub fn register(&mut self, resource: Box<dyn WorktreeResource>) {
        self.resources.push(resource);
    }

    pub fn cleanup(&self, worktree_path: &str) {
        for resource in &self.resources {
            if let Err(error) = resource.on_remove(worktree_path) {
                eprintln!(
                    "Warning: failed to clean up {} for worktree {}: {}",
                    resource.name(),
                    worktree_path,
                    error
                );
            }
        }
    }
}

pub fn default_worktree_lifecycle() -> &'static WorktreeLifecycle {
    static LIFECYCLE: OnceLock<WorktreeLifecycle> = OnceLock::new();

    LIFECYCLE.get_or_init(|| {
        let mut lifecycle = WorktreeLifecycle::default();
        lifecycle.register(Box::new(crate::config::TerminalLayoutResource));
        lifecycle.register(Box::new(crate::config::SessionSnapshotResource));
        lifecycle.register(Box::new(crate::config::PanelLayoutResource));
        lifecycle.register(Box::new(crate::pty::PtySessionResource));
        lifecycle
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    struct TrackingResource {
        name: &'static str,
        calls: Arc<Mutex<Vec<String>>>,
        should_fail: bool,
    }

    impl WorktreeResource for TrackingResource {
        fn name(&self) -> &str {
            self.name
        }

        fn on_remove(&self, worktree_path: &str) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("{}:{worktree_path}", self.name));

            if self.should_fail {
                return Err(format!("{} failed", self.name));
            }

            Ok(())
        }
    }

    #[test]
    fn cleanup_continues_after_resource_error() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let mut lifecycle = WorktreeLifecycle::default();
        lifecycle.register(Box::new(TrackingResource {
            name: "first",
            calls: Arc::clone(&calls),
            should_fail: true,
        }));
        lifecycle.register(Box::new(TrackingResource {
            name: "second",
            calls: Arc::clone(&calls),
            should_fail: false,
        }));

        lifecycle.cleanup("/tmp/grove/worktree");

        assert_eq!(
            *calls.lock().unwrap(),
            vec![
                "first:/tmp/grove/worktree".to_string(),
                "second:/tmp/grove/worktree".to_string(),
            ]
        );
    }
}
