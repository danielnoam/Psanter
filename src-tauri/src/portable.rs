// The portable side of the Windows app: where its data lives, and updating
// the exe in place.
//
// Data: by default in a Data folder beside Piano.exe, so the whole folder
// can be moved or carried on a USB stick. piano-data.json (beside the exe,
// or in AppData when the exe's folder is read-only) can point it at AppData
// or another folder instead. The WebView keeps everything the page stores
// (settings, progress, folder handles) in <data>\EBWebView.
//
// Updates: the newest release's Piano.exe, checked against the minisign
// public key in updater.pub, replaces the running exe (Windows lets a
// running exe be renamed), and the app starts again.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const IDENTIFIER: &str = "io.github.danielnoam.piano";
const CONFIG: &str = "piano-data.json";
const REPO: &str = "danielnoam/piano";
const PUBLIC_KEY: &str = include_str!("../updater.pub");

#[derive(Serialize, Deserialize, Default, Clone)]
struct Config {
    #[serde(default)]
    mode: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    path: String,
    // Where the data was before a change: copied over on the next start.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    from: String,
}

#[derive(Serialize, Clone)]
pub struct Location {
    // "portable", "appdata" or "custom": what's in use.
    pub mode: String,
    pub dir: PathBuf,
    // What was asked for, when it couldn't be used ("readonly", "missing").
    pub problem: String,
    pub exe_dir: PathBuf,
    // Whether the exe's folder can be written: choosing and updating need it.
    pub exe_writable: bool,
}

pub fn exe_path() -> PathBuf {
    std::env::current_exe().unwrap_or_else(|_| PathBuf::from("Piano.exe"))
}
fn exe_dir() -> PathBuf {
    exe_path().parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."))
}
fn appdata() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join(IDENTIFIER)
}

// A folder we can make and write in.
fn writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".piano-write-test");
    let ok = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

fn config_paths(exe_dir: &Path) -> [PathBuf; 2] {
    [exe_dir.join(CONFIG), appdata().join(CONFIG)]
}
fn read_config(exe_dir: &Path) -> Option<(Config, PathBuf)> {
    for p in config_paths(exe_dir) {
        if let Ok(text) = fs::read_to_string(&p) {
            if let Ok(c) = serde_json::from_str::<Config>(&text) {
                return Some((c, p));
            }
        }
    }
    None
}
fn write_config(exe_dir: &Path, c: &Config) -> Result<(), String> {
    let text = serde_json::to_string_pretty(c).map_err(|e| e.to_string())?;
    let [beside, fallback] = config_paths(exe_dir);
    if fs::write(&beside, &text).is_ok() {
        let _ = fs::remove_file(&fallback);
        return Ok(());
    }
    fs::create_dir_all(appdata()).map_err(|e| e.to_string())?;
    fs::write(&fallback, &text).map_err(|e| e.to_string())
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

// Works out where the data lives, before the window opens, and brings it
// along when that changed: after a choice in Settings, or on the first
// portable start of someone whose data is in AppData from an older build.
pub fn resolve() -> Location {
    let exe_dir = exe_dir();
    let exe_writable = writable(&exe_dir);
    let found = read_config(&exe_dir);
    let mut cfg = found.as_ref().map(|(c, _)| c.clone()).unwrap_or_default();
    if cfg.mode.is_empty() {
        cfg.mode = "portable".into();
    }
    let (mode, dir, problem) = match cfg.mode.as_str() {
        "appdata" => ("appdata", appdata(), String::new()),
        "custom" if !cfg.path.is_empty() && writable(Path::new(&cfg.path)) => ("custom", PathBuf::from(&cfg.path), String::new()),
        "custom" => ("appdata", appdata(), "missing".into()),
        _ if exe_writable && writable(&exe_dir.join("Data")) => ("portable", exe_dir.join("Data"), String::new()),
        _ => ("appdata", appdata(), "readonly".into()),
    };
    let _ = fs::create_dir_all(&dir);

    let from = if !cfg.from.is_empty() {
        Some(PathBuf::from(&cfg.from))
    } else if found.is_none() && mode == "portable" {
        Some(appdata())
    } else {
        None
    };
    if let Some(from) = from {
        if from != dir && from.join("EBWebView").is_dir() && !dir.join("EBWebView").exists() {
            let _ = copy_dir(&from.join("EBWebView"), &dir.join("EBWebView"));
        }
    }
    if found.is_none() || !cfg.from.is_empty() {
        cfg.from.clear();
        let _ = write_config(&exe_dir, &cfg);
    }

    // What an update left behind.
    let _ = fs::remove_file(exe_path().with_extension("exe.old"));

    Location { mode: mode.into(), dir, problem, exe_dir, exe_writable }
}

#[tauri::command]
pub fn data_location(state: tauri::State<'_, Location>) -> Location {
    state.inner().clone()
}

// Saves the choice and starts again; the data is copied over on that start
// (the WebView holds its files open while it runs) and the old copy stays.
#[tauri::command]
pub fn set_data_location(app: tauri::AppHandle, state: tauri::State<'_, Location>, mode: String, path: Option<String>) -> Result<(), String> {
    let path = path.unwrap_or_default();
    match mode.as_str() {
        "portable" if !state.exe_writable => return Err("readonly".into()),
        "portable" | "appdata" => {}
        "custom" if !path.is_empty() && writable(Path::new(&path)) => {}
        "custom" => return Err("unwritable".into()),
        _ => return Err("unknown".into()),
    }
    let cfg = Config { mode, path, from: state.dir.to_string_lossy().into_owned() };
    write_config(&state.exe_dir, &cfg)?;
    app.restart();
}

#[derive(Serialize)]
pub struct Update {
    version: String,
    notes: String,
    page: String,
    exe: String,
    sig: String,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    html_url: String,
    #[serde(default)]
    assets: Vec<Asset>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().user_agent("Piano").build().map_err(|e| e.to_string())
}

fn newer(a: &str, b: &str) -> bool {
    let p = |v: &str| v.split('.').map(|x| x.parse::<u64>().unwrap_or(0)).collect::<Vec<_>>();
    p(a) > p(b)
}

// The newest release when it's newer than this copy and carries a signed
// Piano.exe; None otherwise.
#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> Result<Option<Update>, String> {
    let res = client()?
        .get(format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    let rel: Release = res.json().await.map_err(|e| e.to_string())?;
    let version = rel.tag_name.trim_start_matches("app-v").to_string();
    if !newer(&version, &app.package_info().version.to_string()) {
        return Ok(None);
    }
    let url = |name: &str| rel.assets.iter().find(|a| a.name == name).map(|a| a.browser_download_url.clone());
    match (url("Piano.exe"), url("Piano.exe.sig")) {
        (Some(exe), Some(sig)) => Ok(Some(Update { version, notes: rel.body.unwrap_or_default(), page: rel.html_url, exe, sig })),
        _ => Ok(None),
    }
}

pub fn verify(data: &[u8], signature_b64: &str, public_key_b64: &str) -> Result<(), String> {
    use base64::Engine;
    use minisign_verify::{PublicKey, Signature};
    let b64 = |s: &str| -> Result<String, String> {
        let bytes = base64::engine::general_purpose::STANDARD.decode(s.trim()).map_err(|e| e.to_string())?;
        String::from_utf8(bytes).map_err(|e| e.to_string())
    };
    let key = PublicKey::decode(&b64(public_key_b64)?).map_err(|e| e.to_string())?;
    let sig = Signature::decode(&b64(signature_b64)?).map_err(|e| e.to_string())?;
    key.verify(data, &sig, true).map_err(|e| e.to_string())
}

// Downloads the new exe, checks its signature, swaps it in beside the
// running one and starts it.
#[tauri::command]
pub async fn update_install(app: tauri::AppHandle, exe: String, sig: String) -> Result<(), String> {
    if PUBLIC_KEY.trim().is_empty() {
        return Err("nokey".into());
    }
    let c = client()?;
    let get = |url: String| {
        let c = c.clone();
        async move {
            let r = c.get(url).send().await.map_err(|e| e.to_string())?;
            if !r.status().is_success() {
                return Err(format!("HTTP {}", r.status().as_u16()));
            }
            r.bytes().await.map_err(|e| e.to_string())
        }
    };
    let signature = String::from_utf8(get(sig).await?.to_vec()).map_err(|e| e.to_string())?;
    let bytes = get(exe).await?;
    verify(&bytes, &signature, PUBLIC_KEY).map_err(|_| "signature".to_string())?;

    let current = exe_path();
    let fresh = current.with_extension("exe.new");
    let old = current.with_extension("exe.old");
    fs::write(&fresh, &bytes).map_err(|_| "readonly".to_string())?;
    let _ = fs::remove_file(&old);
    fs::rename(&current, &old).map_err(|e| e.to_string())?;
    if let Err(e) = fs::rename(&fresh, &current) {
        let _ = fs::rename(&old, &current);
        return Err(e.to_string());
    }
    relaunch(&current);
    app.exit(0);
    Ok(())
}

// Starts the new exe a moment after this one has gone, so the
// one-copy-only check doesn't hand it back to us.
#[cfg(windows)]
fn relaunch(exe: &Path) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let line = format!("ping -n 2 127.0.0.1 >nul & start \"\" \"{}\"", exe.display());
    let _ = std::process::Command::new("cmd").args(["/C", &line]).creation_flags(CREATE_NO_WINDOW).spawn();
}
#[cfg(not(windows))]
fn relaunch(exe: &Path) {
    let _ = std::process::Command::new(exe).spawn();
}
