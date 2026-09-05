use std::collections::HashMap;

use reqwest::{Method, Url};

const MAX_REQUEST_BODY_BYTES: usize = 1_048_576;

pub(crate) struct ValidatedRequest {
    pub(crate) url: Url,
    pub(crate) method: Method,
    pub(crate) body: Option<String>,
    pub(crate) headers: HashMap<String, String>,
}

pub(crate) fn validate_request(
    endpoint: &str,
    method: &str,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<ValidatedRequest, String> {
    if endpoint.starts_with("//") || endpoint.contains("\\") {
        return Err("Endpoint API tidak valid".to_string());
    }

    let raw_path = endpoint
        .split_once('?')
        .map_or(endpoint, |(path, _)| path)
        .to_ascii_lowercase();
    if raw_path.contains("..") || raw_path.contains("%2e") || raw_path.contains("%2f") {
        return Err("Endpoint API tidak valid".to_string());
    }

    let url = if endpoint.starts_with("https://") || endpoint.starts_with("http://") {
        Url::parse(endpoint).map_err(|_| "Endpoint API tidak valid".to_string())?
    } else if endpoint.starts_with('/') {
        Url::parse(&format!("https://sahamlens.id{endpoint}"))
            .map_err(|_| "Endpoint API tidak valid".to_string())?
    } else {
        return Err("Endpoint API tidak valid".to_string());
    };

    if url.scheme() != "https"
        || url.host_str() != Some("sahamlens.id")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || !url.path().starts_with("/api/")
    {
        return Err("Endpoint di luar API SahamLens ditolak".to_string());
    }

    const FORBIDDEN_ROUTE_PREFIXES: [&str; 5] = [
        "/api/admin/",
        "/api/admin-status",
        "/api/cron/",
        "/api/payment/",
        "/api/analytics/",
    ];
    if FORBIDDEN_ROUTE_PREFIXES
        .iter()
        .any(|prefix| url.path().starts_with(prefix))
    {
        return Err("Route API tidak tersedia untuk aplikasi desktop".to_string());
    }

    let method = match method.to_ascii_uppercase().as_str() {
        "GET" => Method::GET,
        "HEAD" => Method::HEAD,
        "POST" => Method::POST,
        "PUT" => Method::PUT,
        "PATCH" => Method::PATCH,
        "DELETE" => Method::DELETE,
        _ => return Err("Metode API tidak diizinkan".to_string()),
    };

    if matches!(method, Method::GET | Method::HEAD) && body.is_some() {
        return Err("Body tidak diizinkan untuk metode ini".to_string());
    }
    if body
        .as_ref()
        .is_some_and(|value| value.len() > MAX_REQUEST_BODY_BYTES)
    {
        return Err("Body request terlalu besar".to_string());
    }

    let headers = headers
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(name, value)| {
            let normalized = name.to_ascii_lowercase();
            matches!(
                normalized.as_str(),
                "accept" | "content-type" | "x-request-id"
            )
            .then_some((normalized, value))
        })
        .collect();

    Ok(ValidatedRequest {
        url,
        method,
        body,
        headers,
    })
}

#[cfg(test)]
mod tests {
    use super::{validate_request, MAX_REQUEST_BODY_BYTES};
    use std::collections::HashMap;

    #[test]
    fn accepts_only_official_https_api_urls() {
        let request = validate_request("/api/market-data?limit=5", "GET", None, None)
            .expect("relative API URL");
        assert_eq!(
            request.url.as_str(),
            "https://sahamlens.id/api/market-data?limit=5"
        );

        assert!(validate_request("https://sahamlens.id/api/auth/me", "GET", None, None).is_ok());
        for endpoint in [
            "http://sahamlens.id/api/auth/me",
            "https://example.com/api/auth/me",
            "https://api.sahamlens.id/api/auth/me",
            "https://user@sahamlens.id/api/auth/me",
            "https://sahamlens.id:444/api/auth/me",
            "https://sahamlens.id/login",
            "https://sahamlens.id/api/../admin",
            "https://sahamlens.id/api/%2e%2e/admin",
            "https://sahamlens.id/api/admin/stats",
            "https://sahamlens.id/api/admin-status",
            "https://sahamlens.id/api/cron/news",
            "https://sahamlens.id/api/payment/notify",
            "https://sahamlens.id/api/analytics/journey",
            "//example.com/api/auth/me",
        ] {
            assert!(
                validate_request(endpoint, "GET", None, None).is_err(),
                "accepted {endpoint}"
            );
        }
    }

    #[test]
    fn rejects_unknown_methods_instead_of_falling_back_to_get() {
        for method in ["CONNECT", "OPTIONS", "TRACE", "INVALID"] {
            assert!(validate_request("/api/status", method, None, None).is_err());
        }
        for method in ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] {
            assert!(validate_request("/api/status", method, None, None).is_ok());
        }
    }

    #[test]
    fn enforces_body_policy_and_size_limit() {
        assert!(validate_request("/api/status", "GET", Some("x".into()), None).is_err());
        assert!(validate_request("/api/status", "HEAD", Some("x".into()), None).is_err());
        assert!(validate_request(
            "/api/status",
            "POST",
            Some("x".repeat(MAX_REQUEST_BODY_BYTES)),
            None,
        )
        .is_ok());
        assert!(validate_request(
            "/api/status",
            "POST",
            Some("x".repeat(MAX_REQUEST_BODY_BYTES + 1)),
            None,
        )
        .is_err());
    }

    #[test]
    fn forwards_only_explicitly_allowed_headers() {
        let headers = HashMap::from([
            ("accept".to_string(), "application/json".to_string()),
            ("content-type".to_string(), "application/json".to_string()),
            ("x-request-id".to_string(), "req-123".to_string()),
            ("authorization".to_string(), "Bearer stolen".to_string()),
            ("cookie".to_string(), "session=stolen".to_string()),
            ("x-forwarded-host".to_string(), "example.com".to_string()),
        ]);
        let request = validate_request("/api/status", "POST", None, Some(headers)).unwrap();

        assert_eq!(request.headers.len(), 3);
        assert_eq!(
            request.headers.get("accept").map(String::as_str),
            Some("application/json")
        );
        assert_eq!(
            request.headers.get("content-type").map(String::as_str),
            Some("application/json")
        );
        assert_eq!(
            request.headers.get("x-request-id").map(String::as_str),
            Some("req-123")
        );
    }
}
