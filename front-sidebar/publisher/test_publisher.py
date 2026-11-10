import base64
import gzip
import hashlib
import io
import json
import unittest
from publisher import validate_payload, manifest


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


class ManifestTests(unittest.TestCase):
    def test_manifest_is_read_only_and_hashes_public_files(self):
        names=('index.html','zoho.php','app-1.9.4.js','style-1.9.css','style-1.8.css')
        contents={name: name.encode() for name in names}
        opened=[]
        class FakeSftp:
            def open(self,path,mode):
                opened.append((path,mode))
                return io.BytesIO(contents[path.lstrip('/')])
        output=manifest(FakeSftp())
        self.assertEqual(output['action'],'manifest')
        self.assertFalse(output['files_changed'])
        self.assertEqual(set(output['files']),set(names))
        self.assertEqual([mode for _,mode in opened],['rb']*len(names))
        for name in names:
            self.assertEqual(output['files'][name]['sha256'],hashlib.sha256(contents[name]).hexdigest())


if __name__ == '__main__':
    unittest.main()
