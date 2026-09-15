# Publishing Media Gecko on GitHub

## First publication

1. Create an empty GitHub repository named `media-gecko`. Do not add a README or `.gitignore` on GitHub.
2. Open PowerShell in this project directory.
3. Run:

```powershell
git init
git add .
git commit -m "Release Media Gecko 1.5.3"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/media-gecko.git
git push -u origin main
```

## Publish a release

```powershell
git tag v1.5.3
git push origin v1.5.3
```

The included GitHub Actions workflow builds the Windows installer and attaches it to a GitHub Release.

## Remove the Windows publisher warning

A trusted Authenticode certificate is required. Add these repository secrets under **Settings → Secrets and variables → Actions**:

- `WIN_CSC_LINK`: the base64-encoded `.pfx`, a secure HTTPS URL, or the certificate file payload supported by electron-builder.
- `WIN_CSC_KEY_PASSWORD`: the certificate password.

Never commit a `.pfx`, password, API key, or signing token. A standard OV certificate can still require SmartScreen reputation. Azure Artifact Signing or the appropriate trusted certificate route gives the strongest publisher identity.
