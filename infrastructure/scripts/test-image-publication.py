"""Exercise registry failure and version reuse with a fake Docker executable."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
DIGEST = 'sha256:' + 'a' * 64
OTHER = 'sha256:' + 'b' * 64
SHA = 'c' * 40
FAKE = '''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
args=sys.argv[1:]
state=Path(os.environ['FAKE_STATE'])
data=json.loads(state.read_text())
if args[:3]==['buildx','imagetools','inspect']:
 ref=args[3]
 value=data.get(ref)
 if value=='denied': print('access denied',file=sys.stderr);sys.exit(1)
 if not value: print('manifest unknown',file=sys.stderr);sys.exit(1)
 print(json.dumps({'digest':value}))
elif args[:3]==['buildx','imagetools','create']:
 with open(os.environ['FAKE_CALLS'],'a') as log: log.write('create\\n')
 data[args[4]]=args[5].split('@')[1]
 state.write_text(json.dumps(data))
else: sys.exit(2)
'''


class Publication(unittest.TestCase):
    def exercise(self, version_value=None, commit_value=DIGEST, expected=0, creates=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake = root / 'docker'
            fake.write_text(FAKE)
            fake.chmod(0o755)
            state = root / 'state.json'
            images = {'example/app:sha-' + SHA: commit_value}
            if version_value: images['example/app:v1.2.3'] = version_value
            state.write_text(json.dumps(images))
            calls = root / 'calls'
            env = dict(os.environ, PATH=tmp + os.pathsep + os.environ['PATH'], FAKE_STATE=str(state), FAKE_CALLS=str(calls))
            result = subprocess.run(['sh', str(ROOT / 'publish-version.sh'), 'example/app', SHA, 'v1.2.3'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, expected, result.stderr)
            self.assertEqual(calls.exists(), creates)
            if expected == 0: self.assertEqual(json.loads(state.read_text())['example/app:v1.2.3'], DIGEST)

    def test_assign_missing_version(self): self.exercise(creates=True)
    def test_reuse_same_version(self): self.exercise(version_value=DIGEST)
    def test_refuse_reassigned_version(self): self.exercise(version_value=OTHER, expected=1)
    def test_auth_failure_never_creates_version(self): self.exercise(version_value='denied', expected=1)
    def test_missing_commit_never_creates_version(self): self.exercise(commit_value=None, expected=1)
    def test_commit_auth_failure_never_creates_version(self): self.exercise(commit_value='denied', expected=1)


if __name__ == '__main__': unittest.main()
