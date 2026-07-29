import assert from 'node:assert/strict';
import test from 'node:test';
import { assertModuleSource } from '../../dist/runtime/moduleHmr.js';

const URL = 'http://127.0.0.1:8081/rayact/m/src/App.tsx';

test('valid module source passes through unchanged', () => {
  const source = '(function(){ var exports={}; })();';
  assert.equal(assertModuleSource(source, URL), source);
});

test('an empty body is rejected instead of being evaluated', () => {
  assert.throws(() => assertModuleSource('', URL), /Empty module response/);
  assert.throws(() => assertModuleSource('   \n', URL), /Empty module response/);
});

test('the native dev-fetch error sentinel is rejected and names the module', () => {
  assert.throws(
    () => assertModuleSource('Error: [rayact:devfetch] HTTP 404 from http://127.0.0.1:8081/x', URL),
    (error) => /rayact:devfetch/.test(error.message) && error.message.includes(URL)
  );
});

test('a plain-text resolve failure is rejected rather than eval-ed as JS', () => {
  assert.throws(
    () => assertModuleSource('Cannot resolve ./nope from /src/App.tsx', URL),
    /Cannot resolve/
  );
  assert.throws(() => assertModuleSource('Module not found: /src/x.tsx', URL), /Module not found/);
});

test('source that merely mentions Error later is still accepted', () => {
  const source = 'var x = 1;\nthrow new Error("later");';
  assert.equal(assertModuleSource(source, URL), source);
});
