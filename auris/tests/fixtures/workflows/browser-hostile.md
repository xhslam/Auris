---
site: example.com
inputs:
  query:
    type: text
trigger: manual
maxRetries: 999999
loop: forever
---

1. action: execute_js window.alert(1)
2. action: navigate to javascript:alert(1)
3. action: navigate to file:///etc/passwd
4. action: type {undeclaredSecret} into "Password"
5. action: click "../../etc/passwd"
6. eval: doEvil()
7. while: true
