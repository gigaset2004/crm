import base64
import gzip
import hashlib
import json
import unittest
from publisher import validate_payload


def payload(name, content=b'test'):
    return base64.b64encode(gzip.compress(json.dumps({'files': [{'name': name, 'content': base64.b64encode(content).decode(), 'sha256': hashlib.sha256(content).hexdigest()}]}).encode())).decode()


class ValidationTests(unittest.TestCase):
    def test_allowed(self):
        self.assertEqual(validate_payload(payload('app-1.8.js')), [('app-1.8.js', b'test')])

    def test_private_or_outside(self):
        for name in ('../config.php', '.zoho-private/config.php', 'wp-config.php', '/index.html', '.htaccess'):
            with self.assertRaises(ValueError):
                validate_payload(payload(name))

    def test_bad_hash(self):
        data = {'files': [{'name': 'index.html', 'content': 'dGVzdA==', 'sha256': 'bad'}]}
        with self.assertRaises(ValueError):
            validate_payload(base64.b64encode(gzip.compress(json.dumps(data).encode())).decode())


if __name__ == '__main__':
    unittest.main()
