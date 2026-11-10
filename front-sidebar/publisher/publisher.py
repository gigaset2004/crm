"""On-demand WPX publisher. Never returns or logs credentials or file contents."""
import base64
import gzip
import hashlib
import io
import json
import os
import re
import sys
import uuid

HOST_KEY = 'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBH5+JXRWE9N1qGBKk7OfCSkPqHyANG6QnQFsOxDtYkSnL/YLNwKfG1jO6jqMPztZXS4QNBGDwMWRoAkLEwTrwcM='
MAX_SIZE = 4 * 1024 * 1024


def validate_payload(encoded):
    packed = base64.b64decode(encoded, validate=True)
    if len(packed) > MAX_SIZE:
        raise ValueError('payload_size')
    with gzip.GzipFile(fileobj=io.BytesIO(packed)) as stream:
        raw = stream.read(MAX_SIZE + 1)
    if len(raw) > MAX_SIZE:
        raise ValueError('payload_size')
    data = json.loads(raw)
    files = data.get('files', [])
    if not isinstance(files, list) or not 1 <= len(files) <= 20:
        raise ValueError('file_count')
    result = []
    names = set()
    for item in files:
        name = item.get('name', '')
        allowed = name in ('index.html', 'zoho.php', 'create-options.php') or re.fullmatch(r'(app-[0-9.]+\.js|style-[0-9.]+\.css)', name)
        if not allowed or name in names:
            raise ValueError('file_name')
        names.add(name)
        content = base64.b64decode(item['content'], validate=True)
        if len(content) > MAX_SIZE or hashlib.sha256(content).hexdigest() != item.get('sha256'):
            raise ValueError('file_hash')
        result.append((name, content))
    return sorted(result, key=lambda item: (item[0] == 'index.html', item[0]))


def write(sftp, path, content):
    with sftp.open(path, 'wb') as stream:
        stream.write(content)
    sftp.chmod(path, 0o600)


def publish(sftp, files):
    # This account is jailed to /front-app/. Reject a different remote root.
    for name in ('/index.html', '/zoho.php'):
        sftp.stat(name)
    release = str(uuid.uuid4())
    lock = '/.publisher-lock'
    sftp.mkdir(lock, mode=0o700)
    changed = []
    backup = {}
    folder = '/.publisher-backups/' + release
    try:
        try:
            sftp.stat('/.publisher-backups')
        except FileNotFoundError:
            sftp.mkdir('/.publisher-backups', mode=0o700)
        write(sftp, '/.publisher-backups/.htaccess', b'Require all denied\n')
        sftp.mkdir(folder, mode=0o700)
        for name, content in files:
            try:
                with sftp.open('/' + name, 'rb') as stream:
                    previous = stream.read(MAX_SIZE + 1)
                if len(previous) > MAX_SIZE:
                    raise ValueError('backup_size')
                backup[name] = previous
                write(sftp, folder + '/old-' + name, previous)
            except FileNotFoundError:
                backup[name] = None
            write(sftp, folder + '/new-' + name, content)
            with sftp.open(folder + '/new-' + name, 'rb') as stream:
                if hashlib.sha256(stream.read(MAX_SIZE + 1)).digest() != hashlib.sha256(content).digest():
                    raise ValueError('remote_hash')
        for name, _ in files:
            sftp.chmod(folder + '/new-' + name, 0o644)
            sftp.posix_rename(folder + '/new-' + name, '/' + name)
            changed.append(name)
        return {'ok': True, 'action': 'publish', 'release': release, 'files': [name for name, _ in files]}
    except Exception:
        for name in reversed(changed):
            if backup[name] is None:
                sftp.remove('/' + name)
            else:
                write(sftp, folder + '/restore-' + name, backup[name])
                sftp.chmod(folder + '/restore-' + name, 0o644)
                sftp.posix_rename(folder + '/restore-' + name, '/' + name)
        raise
    finally:
        sftp.rmdir(lock)


def manifest(sftp):
    # Read-only integrity check. Never prints source, private files or credentials.
    names = ('index.html', 'zoho.php', 'app-1.9.4.js', 'style-1.9.css', 'style-1.8.css')
    result = {}
    for name in names:
        hasher = hashlib.sha256()
        size = 0
        with sftp.open('/' + name, 'rb') as stream:
            while True:
                chunk = stream.read(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_SIZE:
                    raise ValueError('manifest_size')
                hasher.update(chunk)
        result[name] = {'sha256': hasher.hexdigest(), 'size': size}
    return {'ok': True, 'action': 'manifest', 'files': result, 'files_changed': False}


def write_probe(sftp):
    path = '/.publisher-test-' + str(uuid.uuid4())
    renamed = path + '-renamed'
    content = b'Front publisher write verification\n'
    try:
        with sftp.open(path, 'wx') as stream:
            stream.write(content)
        sftp.chmod(path, 0o600)
        with sftp.open(path, 'rb') as stream:
            if stream.read() != content:
                raise ValueError('test_readback')
        sftp.posix_rename(path, renamed)
    finally:
        for target in (path, renamed):
            try:
                sftp.remove(target)
            except FileNotFoundError:
                pass
    return {'ok': True, 'action': 'write_probe', 'write': True, 'readback': True, 'atomic_rename': True, 'test_file_removed': True, 'app_files_changed': False}


def main():
    import paramiko
    action = os.environ.get('ACTION', 'probe')
    if action not in ('probe', 'write_probe', 'publish', 'manifest', 'install_front_token', 'verify_front'):
        raise ValueError('action')
    payload = os.environ.get('PAYLOAD_B64', '') or ''.join(os.environ.get('PAYLOAD_B64_' + str(i), '') for i in range(8))
    files = validate_payload(payload) if action == 'publish' else []
    host = os.environ['SFTP_HOST'].strip().removeprefix('sftp://').rstrip('/')
    port = int(os.environ['SFTP_PORT'].strip())
    # Fail closed if the stored endpoint does not match this application's WPX.
    if host != 's31.wpx.net' or port != 2222:
        raise ValueError('unexpected_endpoint')
    ssh = paramiko.SSHClient()
    key = paramiko.ECDSAKey(data=base64.b64decode(HOST_KEY))
    ssh.get_host_keys().add('[s31.wpx.net]:2222', key.get_name(), key)
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(host, port=port, username=os.environ['SFTP_USERNAME'].strip(), password=os.environ['SFTP_PASSWORD'].rstrip('\r\n'), allow_agent=False, look_for_keys=False, timeout=15, auth_timeout=15, banner_timeout=15)
    try:
        with ssh.open_sftp() as sftp:
            sftp.get_channel().settimeout(30)
            sftp.stat('/index.html')
            sftp.stat('/zoho.php')
            if action == 'manifest':
                print(json.dumps(manifest(sftp)), flush=True)
                return
            if action == 'install_front_token':
                token = os.environ['FRONT_API_TOKEN'].strip()
                if not token or '\n' in token or '\r' in token:
                    raise ValueError('front_token')
                private = '/.zoho-private/front-token.php'
                stage = private + '.' + str(uuid.uuid4()) + '.php'
                encoded = base64.b64encode(token.encode()).decode()
                body = ('<?php if (!defined("MINMAX_ZOHO_INTERNAL")) { http_response_code(404); exit; } return ["token"=>base64_decode("' + encoded + '")];').encode()
                try:
                    write(sftp, stage, body)
                    sftp.posix_rename(stage, private)
                finally:
                    try:
                        sftp.remove(stage)
                    except FileNotFoundError:
                        pass
                print(json.dumps({'ok': True, 'action': action, 'token_installed': True}), flush=True)
                return
            if action == 'verify_front':
                import urllib.request
                url = 'https://api2.frontapp.com/conversations/cnv_1gsaz26q/messages?limit=100'
                seen, handles, count = set(), set(), 0
                while url:
                    if not url.startswith('https://api2.frontapp.com/conversations/cnv_1gsaz26q/messages?') or url in seen or len(seen) >= 1000:
                        raise ValueError('front_page')
                    seen.add(url)
                    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + os.environ['FRONT_API_TOKEN'].strip(), 'Accept': 'application/json'})
                    with urllib.request.urlopen(req, timeout=30) as response:
                        data = json.load(response)
                    for message in data['_results']:
                        count += 1
                        handles.update(p.get('handle', '').lower() for p in message.get('recipients', []))
                    url = data.get('_pagination', {}).get('next')
                print(json.dumps({'ok': True, 'action': action, 'messages_scanned': count, 'pages_scanned': len(seen), 'rf_found': 'rf@rftradingalliance.com' in handles, 'r_ferraz_found': 'r.ferraz@doctorskinonline.com' in handles}), flush=True)
                return
            result = write_probe(sftp) if action == 'write_probe' else publish(sftp, files) if files else {'ok': True, 'action': 'probe', 'sftp': 'connected', 'app_root': 'verified', 'files_changed': False}
            print(json.dumps(result), flush=True)
    finally:
        ssh.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No exception strings: they can contain connection details or secrets.
        print(json.dumps({'ok': False, 'error_type': type(error).__name__}), flush=True)
        sys.exit(1)
