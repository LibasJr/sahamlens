use tauri::Url;

const ALLOWED_EXTERNAL_HOSTS: [&str; 6] = [
    "sahamlens.id",
    "www.sahamlens.id",
    "idx.co.id",
    "www.idx.co.id",
    "ksei.co.id",
    "ojk.go.id",
];

pub(crate) fn validate_external_url(candidate: &str) -> Result<Url, String> {
    let url = Url::parse(candidate).map_err(|_| "URL eksternal tidak valid".to_string())?;

    if url.scheme() != "https" {
        return Err("Hanya tautan HTTPS yang dapat dibuka".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URL eksternal tidak valid".to_string());
    }
    if url.port().is_some() {
        return Err("Port non-standar tidak diizinkan".to_string());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "URL eksternal tidak valid".to_string())?
        .to_ascii_lowercase();
    if !ALLOWED_EXTERNAL_HOSTS.contains(&host.as_str()) {
        return Err("Domain eksternal belum diizinkan".to_string());
    }

    Ok(url)
}

const DEEP_LINK_SCHEME: &str = "sahamlens://";
const MAX_TICKER_LEN: usize = 6;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum DeepLinkAction {
    Ticker(String),
    Screener,
    Watchlist,
}

pub(crate) fn parse_deep_link(candidate: &str) -> Result<DeepLinkAction, String> {
    let rest = candidate
        .strip_prefix(DEEP_LINK_SCHEME)
        .ok_or_else(|| "Deep link tidak dikenali".to_string())?;
    if rest.is_empty() || rest.contains('?') || rest.contains('#') || rest.contains('%') {
        return Err("Deep link tidak dikenali".to_string());
    }

    let mut segments = rest.split('/');
    let action = segments.next().unwrap_or_default();
    let argument = segments.next();
    if segments.next().is_some() {
        return Err("Deep link tidak dikenali".to_string());
    }

    match (action, argument) {
        ("screener", None) => Ok(DeepLinkAction::Screener),
        ("watchlist", None) => Ok(DeepLinkAction::Watchlist),
        ("ticker", Some(ticker)) => {
            if ticker.is_empty()
                || ticker.len() > MAX_TICKER_LEN
                || !ticker.chars().all(|c| c.is_ascii_alphanumeric())
            {
                return Err("Ticker pada deep link tidak valid".to_string());
            }
            Ok(DeepLinkAction::Ticker(ticker.to_ascii_uppercase()))
        }
        _ => Err("Deep link tidak dikenali".to_string()),
    }
}

pub(crate) fn deep_link_route(action: &DeepLinkAction) -> String {
    match action {
        DeepLinkAction::Ticker(ticker) => format!("/dashboard?symbol={ticker}"),
        DeepLinkAction::Screener => "/screener".to_string(),
        DeepLinkAction::Watchlist => "/watchlist".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{deep_link_route, parse_deep_link, validate_external_url, DeepLinkAction};

    #[test]
    fn maps_deep_link_actions_to_bundled_desktop_routes() {
        assert_eq!(
            deep_link_route(&DeepLinkAction::Ticker("BBCA".to_string())),
            "/dashboard?symbol=BBCA"
        );
        assert_eq!(deep_link_route(&DeepLinkAction::Screener), "/screener");
        assert_eq!(deep_link_route(&DeepLinkAction::Watchlist), "/watchlist");
    }

    #[test]
    fn parses_only_the_closed_deep_link_action_schema() {
        assert_eq!(
            parse_deep_link("sahamlens://ticker/bbca").unwrap(),
            DeepLinkAction::Ticker("BBCA".to_string())
        );
        assert_eq!(
            parse_deep_link("sahamlens://screener").unwrap(),
            DeepLinkAction::Screener
        );
        assert_eq!(
            parse_deep_link("sahamlens://watchlist").unwrap(),
            DeepLinkAction::Watchlist
        );

        for candidate in [
            "sahamlens://ticker/../admin",
            "sahamlens://ticker/%2e%2e",
            "sahamlens://ticker/BB CA",
            "sahamlens://ticker/BBCA/extra",
            "sahamlens://ticker/",
            "sahamlens://ticker/TOOLONG",
            "sahamlens://admin",
            "sahamlens://screener/extra",
            "https://sahamlens.id/ticker/BBCA",
            "sahamlens://",
            "",
        ] {
            assert!(parse_deep_link(candidate).is_err(), "accepted {candidate}");
        }
    }

    #[test]
    fn accepts_only_safe_https_urls_on_allowlisted_hosts() {
        let url = validate_external_url("https://sahamlens.id/terms").expect("https url");
        assert_eq!(url.as_str(), "https://sahamlens.id/terms");
        assert!(validate_external_url("https://idx.co.id/id/berita").is_ok());
        assert!(validate_external_url("https://WWW.IDX.CO.ID/id").is_ok());

        for candidate in [
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "sahamlens://open",
            "http://sahamlens.id/terms",
            "https://user:pass@sahamlens.id/terms",
            "https://sahamlens.id:8443/terms",
            "https://evil.com/terms",
            "https://sahamlens.id.evil.com/terms",
            "https://",
            "not a url",
            "",
        ] {
            assert!(
                validate_external_url(candidate).is_err(),
                "accepted {candidate}"
            );
        }
    }
}
