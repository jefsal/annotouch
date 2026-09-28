# Security Policy

## Reporting a Vulnerability

Please do not report suspected vulnerabilities in a public issue, pull request,
or discussion.

Use GitHub's private vulnerability reporting for Annotouch:

<https://github.com/jefsal/annotouch/security/advisories/new>

Include the affected behavior, steps to reproduce, impact, and any suggested
mitigation. Use a generated or redacted PDF when a file is required to
demonstrate the issue.

The maintainer will acknowledge the report when it is reviewed and coordinate
validation, remediation, and disclosure through the private advisory. Please
allow time for a fix before sharing vulnerability details publicly.

## Scope

Security-sensitive areas include:

- unexpected transmission or persistence of local PDF contents or annotations;
- unsafe handling of malformed or hostile PDF files;
- script execution or content injection through PDF data or annotations;
- dependency vulnerabilities that affect the shipped browser application; and
- exported documents that contain data the user did not choose to export.

General bugs and feature requests belong in the public
[issue tracker](https://github.com/jefsal/annotouch/issues).
