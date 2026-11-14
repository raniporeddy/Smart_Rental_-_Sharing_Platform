import os
import re
import unittest
from backend.app import create_app
from backend.config import normalize_database_url, build_engine_options, resolve_ssl_ca_path


class TestDeployReadiness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app({
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-jwt-secret-key-1234567890",
        })
        cls.client = cls.app.test_client()

    def test_health_endpoint(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("service"), "smart-rental-sharing-api")

    def test_cors_localhost(self):
        res = self.client.get("/api/health", headers={"Origin": "http://localhost:5173"})
        self.assertEqual(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173")

    def test_cors_vercel_domain(self):
        res = self.client.get("/api/health", headers={"Origin": "https://my-app.vercel.app"})
        self.assertEqual(res.headers.get("Access-Control-Allow-Origin"), "https://my-app.vercel.app")

        res2 = self.client.get("/api/health", headers={"Origin": "https://preview-123.smart-rental.vercel.app"})
        self.assertEqual(res2.headers.get("Access-Control-Allow-Origin"), "https://preview-123.smart-rental.vercel.app")

    def test_cors_disallow_unauthorized_domain(self):
        res = self.client.get("/api/health", headers={"Origin": "https://malicious-site.com"})
        self.assertIsNone(res.headers.get("Access-Control-Allow-Origin"))

    def test_tidb_url_normalization(self):
        raw = "mysql://user:pass@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/db?ssl_ca=/etc/ssl/certs/ca-certificates.crt"
        norm = normalize_database_url(raw)
        self.assertTrue(norm.startswith("mysql+pymysql://"))
        self.assertIn("ssl_ca=", norm)

    def test_tidb_ssl_engine_options(self):
        ca = resolve_ssl_ca_path()
        self.assertTrue(os.path.exists(ca))
        url = "mysql+pymysql://user:pass@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/db"
        opts = build_engine_options(url)
        self.assertIn("connect_args", opts)
        self.assertIn("ssl", opts["connect_args"])
        self.assertEqual(opts["connect_args"]["ssl"]["ca"], ca)
        self.assertEqual(opts["pool_recycle"], 280)
        self.assertTrue(opts["pool_pre_ping"])


if __name__ == "__main__":
    unittest.main()
