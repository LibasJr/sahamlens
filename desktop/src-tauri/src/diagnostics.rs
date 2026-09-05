use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiagnosticInput {
    pub route: String,
    pub status_code: u16,
    pub latency_ms: u64,
    pub request_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagnosticEnvelope {
    application_version: String,
    os_family: String,
    pub(crate) route_class: String,
    status_code: u16,
    pub(crate) latency_bucket: String,
    pub(crate) request_id: Option<String>,
    timestamp_unix_seconds: u64,
}

pub(crate) fn build_diagnostic_envelope(
    application_version: &str,
    os_family: &str,
    input: DiagnosticInput,
) -> DiagnosticEnvelope {
    DiagnosticEnvelope {
        application_version: application_version.to_string(),
        os_family: os_family.to_string(),
        route_class: classify_route(&input.route).to_string(),
        status_code: input.status_code,
        latency_bucket: latency_bucket(input.latency_ms).to_string(),
        request_id: input.request_id.filter(|id| {
            !id.is_empty()
                && id.len() <= 80
                && id.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
                })
        }),
        timestamp_unix_seconds: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    }
}

fn classify_route(route: &str) -> &'static str {
    let path = route.split(['?', '#']).next().unwrap_or_default();
    if path.contains("/api/stock/") {
        "stock"
    } else if path.contains("/api/market/") {
        "market"
    } else if path.contains("/api/auth/") {
        "auth"
    } else if path.contains("/api/") {
        "api-other"
    } else {
        "other"
    }
}

fn latency_bucket(milliseconds: u64) -> &'static str {
    match milliseconds {
        0..=99 => "0-99ms",
        100..=499 => "100-499ms",
        500..=999 => "500-999ms",
        1_000..=4_999 => "1000-4999ms",
        _ => "5000ms+",
    }
}

#[cfg(test)]
mod tests {
    use super::{build_diagnostic_envelope, DiagnosticInput};

    #[test]
    fn emits_only_the_allowlisted_privacy_safe_fields() {
        let envelope = build_diagnostic_envelope(
            "1.1.0",
            "windows",
            DiagnosticInput {
                route: "https://sahamlens.id/api/stock/BBCA?email=user@example.com".into(),
                status_code: 503,
                latency_ms: 874,
                request_id: Some("req_ABC-123".into()),
            },
        );
        let value = serde_json::to_value(envelope).unwrap();
        assert_eq!(value["applicationVersion"], "1.1.0");
        assert_eq!(value["osFamily"], "windows");
        assert_eq!(value["routeClass"], "stock");
        assert_eq!(value["statusCode"], 503);
        assert_eq!(value["latencyBucket"], "500-999ms");
        assert_eq!(value["requestId"], "req_ABC-123");
        let serialized = value.to_string();
        for forbidden in [
            "BBCA",
            "user@example.com",
            "authorization",
            "cookie",
            "body",
        ] {
            assert!(!serialized.contains(forbidden), "leaked {forbidden}");
        }
    }

    #[test]
    fn drops_invalid_request_ids_and_unknown_route_details() {
        let envelope = build_diagnostic_envelope(
            "1.1.0",
            "linux",
            DiagnosticInput {
                route: "/private/portfolio/secret".into(),
                status_code: 400,
                latency_ms: 12_000,
                request_id: Some("token=user@example.com".into()),
            },
        );
        assert_eq!(envelope.route_class, "other");
        assert_eq!(envelope.latency_bucket, "5000ms+");
        assert_eq!(envelope.request_id, None);
    }
}
