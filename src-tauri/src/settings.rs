//! App settings stored as `settings.json` in the Tauri app-data directory.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub onboarding_completed: bool,
    pub vault_path: Option<String>,
    pub theme: String,
    pub font: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            onboarding_completed: false,
            vault_path: None,
            theme: "dhyana-light".into(),
            font: "serif".into(),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub onboarding_completed: Option<bool>,
    pub theme: Option<String>,
    pub font: Option<String>,
}

impl Settings {
    pub fn apply(&mut self, patch: SettingsPatch) {
        if let Some(v) = patch.onboarding_completed {
            self.onboarding_completed = v;
        }
        if let Some(v) = patch.theme {
            self.theme = v;
        }
        if let Some(v) = patch.font {
            self.font = v;
        }
    }

    /// Missing or unreadable settings fall back to defaults.
    pub fn load(path: &Path) -> Settings {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp: PathBuf = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        fs::rename(&tmp, path)
    }

    /// The saved vault path only if the folder still exists.
    pub fn existing_vault(&self) -> Option<PathBuf> {
        self.vault_path
            .as_ref()
            .map(PathBuf::from)
            .filter(|p| p.is_dir())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn defaults_when_missing_or_corrupt() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("settings.json");
        assert_eq!(Settings::load(&p), Settings::default());
        fs::write(&p, "not json").unwrap();
        assert_eq!(Settings::load(&p), Settings::default());
    }

    #[test]
    fn round_trip_and_patch() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("nested/settings.json");
        let mut s = Settings::default();
        s.apply(SettingsPatch {
            onboarding_completed: Some(true),
            theme: Some("dark".into()),
            font: None,
        });
        s.vault_path = Some(dir.path().display().to_string());
        s.save(&p).unwrap();
        let loaded = Settings::load(&p);
        assert_eq!(loaded, s);
        assert_eq!(loaded.font, "serif");
        assert_eq!(loaded.existing_vault().as_deref(), Some(dir.path()));
    }

    #[test]
    fn missing_vault_dir_is_none() {
        let s = Settings {
            vault_path: Some("Z:/definitely/not/here".into()),
            ..Settings::default()
        };
        assert!(s.existing_vault().is_none());
    }

    #[test]
    fn partial_json_fills_defaults() {
        let s: Settings = serde_json::from_str(r#"{"onboardingCompleted":true}"#).unwrap();
        assert!(s.onboarding_completed);
        assert_eq!(s.theme, "dhyana-light");
    }
}
