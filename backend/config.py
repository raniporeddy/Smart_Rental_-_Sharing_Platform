import os
import urllib.parse
import certifi


def resolve_ssl_ca_path():
    """Locate a valid CA certificate bundle cross-platform (Linux/Render and Windows)."""
    custom_ca = os.getenv("SSL_CA_PATH")
    if custom_ca and os.path.exists(custom_ca):
        return custom_ca
    # Standard Linux / Debian / Render CA bundle
    if os.path.exists("/etc/ssl/certs/ca-certificates.crt"):
        return "/etc/ssl/certs/ca-certificates.crt"
    # Fallback to certifi's Mozilla CA bundle (works on Windows and macOS)
    return certifi.where()


def normalize_database_url(raw_url):
    """Normalize database URL for SQLAlchemy and ensure valid CA certificate path."""
    if not raw_url:
        return raw_url
    url = raw_url.strip()
    if url.startswith("mysql://"):
        url = "mysql+pymysql://" + url[len("mysql://"):]
    # If ssl_ca is provided in query params and the file doesn't exist on this OS, remap it
    if "ssl_ca=" in url:
        parsed = urllib.parse.urlsplit(url)
        params = urllib.parse.parse_qs(parsed.query)
        if "ssl_ca" in params and params["ssl_ca"]:
            configured_ca = params["ssl_ca"][0]
            if not os.path.exists(configured_ca):
                params["ssl_ca"] = [resolve_ssl_ca_path()]
                new_query = urllib.parse.urlencode(params, doseq=True)
                url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
    return url


def build_engine_options(database_url):
    """Configure SQLAlchemy connection pooling and SSL for cloud databases like TiDB."""
    options = {
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "280")),
        "pool_pre_ping": True,
    }
    if database_url and ("mysql" in database_url):
        is_tidb = (
            "tidbcloud.com" in database_url
            or os.getenv("TIDB_SSL", "").lower() in ("true", "1", "yes")
            or os.getenv("MYSQL_SSL", "").lower() in ("true", "1", "yes")
        )
        has_ssl_query = "ssl_ca=" in database_url or "ssl=" in database_url
        if is_tidb and not has_ssl_query:
            options["connect_args"] = {
                "ssl": {
                    "ca": resolve_ssl_ca_path(),
                }
            }
    return options


class Config:
    SQLALCHEMY_DATABASE_URI = normalize_database_url(os.getenv("DATABASE_URL"))
    SQLALCHEMY_ENGINE_OPTIONS = build_engine_options(SQLALCHEMY_DATABASE_URI)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "60")) * 60
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "static", "uploads")
    RESET_TOKEN_MINUTES = int(os.getenv("RESET_TOKEN_MINUTES", "15"))
    RESET_TOKEN_DELIVERY = os.getenv("RESET_TOKEN_DELIVERY", "simulation")
    LATE_PENALTY_MULTIPLIER = os.getenv("LATE_PENALTY_MULTIPLIER", "1.0")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173")
