# Deploy Auth API to Azure Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the FastAPI auth/cloud API as a Docker container on Azure Web App for Containers so the mobile app can authenticate and sync.

**Architecture:** Build and push `Dockerfile.app` to the caremanager ACR, create an Azure Web App pulling from it, configure env vars, update mobile config to point at the Azure URL.

**Tech Stack:** Docker, Azure CLI, Azure App Service, Azure Container Registry

**Spec:** `docs/superpowers/specs/2026-03-30-azure-web-app-deploy-design.md`

**Prerequisites:** User must know the caremanager ACR login server name (e.g. `caremanager.azurecr.io`) and have admin credentials or a service principal for it.

---

### Task 1: Install Azure CLI

**Files:** None (system setup)

- [ ] **Step 1: Install Azure CLI via Homebrew**

```bash
brew update && brew install azure-cli
```

- [ ] **Step 2: Verify installation**

```bash
az version
```

Expected: Output showing `azure-cli` version 2.x

- [ ] **Step 3: Login to Azure**

```bash
az login
```

This opens a browser for authentication. Follow the prompts and select the correct subscription.

- [ ] **Step 4: Verify subscription**

```bash
az account show --query "{name:name, id:id}" -o table
```

Expected: Shows the subscription where the caremanager ACR lives.

---

### Task 2: Build and push Docker image to ACR

**Files:**
- Read: `backend/Dockerfile.app`
- Read: `backend/requirements.txt`
- Read: `backend/app/main.py`

- [ ] **Step 1: Identify the ACR login server**

```bash
az acr list --query "[].{name:name,loginServer:loginServer}" -o table
```

Find the caremanager registry. Note the `loginServer` value (e.g. `caremanager.azurecr.io`). We'll refer to it as `<ACR_LOGIN_SERVER>` below.

- [ ] **Step 2: Login to the ACR**

```bash
az acr login --name <ACR_NAME>
```

Replace `<ACR_NAME>` with the registry name (without `.azurecr.io`).
Expected: `Login Succeeded`

- [ ] **Step 3: Build the Docker image**

```bash
cd /Users/davidlynes/Documents/meeting-notes/backend
docker build -f Dockerfile.app -t iqcapture-api:latest .
```

Expected: Build completes successfully. Final line shows image ID.

- [ ] **Step 4: Tag for ACR**

```bash
docker tag iqcapture-api:latest <ACR_LOGIN_SERVER>/iqcapture-api:latest
```

- [ ] **Step 5: Push to ACR**

```bash
docker push <ACR_LOGIN_SERVER>/iqcapture-api:latest
```

Expected: All layers pushed. Final line shows the digest.

- [ ] **Step 6: Verify the image is in the registry**

```bash
az acr repository list --name <ACR_NAME> -o table
```

Expected: `iqcapture-api` appears in the list.

---

### Task 3: Create Azure Web App for Containers

**Files:** None (Azure resource creation)

- [ ] **Step 1: Identify the resource group**

```bash
az group list --query "[?contains(name,'caremanager')].{name:name,location:location}" -o table
```

Note the resource group name. We'll refer to it as `<RESOURCE_GROUP>`.

- [ ] **Step 2: Create an App Service Plan (if one doesn't already exist)**

Check for existing plans first:

```bash
az appservice plan list --resource-group <RESOURCE_GROUP> --query "[].{name:name,sku:sku.name}" -o table
```

If no suitable Linux plan exists, create one:

```bash
az appservice plan create \
  --name iqcapture-plan \
  --resource-group <RESOURCE_GROUP> \
  --is-linux \
  --sku B1 \
  --location uksouth
```

If a Linux plan already exists and has capacity, use that instead (note its name as `<PLAN_NAME>`).

- [ ] **Step 3: Create the Web App**

```bash
az webapp create \
  --name iqcapture-api \
  --resource-group <RESOURCE_GROUP> \
  --plan <PLAN_NAME> \
  --container-image-name <ACR_LOGIN_SERVER>/iqcapture-api:latest \
  --container-registry-url https://<ACR_LOGIN_SERVER>
```

Expected: JSON output with the Web App details. Note the `defaultHostName` (e.g. `iqcapture-api.azurewebsites.net`).

If the name `iqcapture-api` is taken, try `iqcapture-api-uk` or similar.

- [ ] **Step 4: Configure the container port**

```bash
az webapp config appsettings set \
  --name iqcapture-api \
  --resource-group <RESOURCE_GROUP> \
  --settings WEBSITES_PORT=5167
```

- [ ] **Step 5: Enable ACR pull credentials**

```bash
az webapp config container set \
  --name iqcapture-api \
  --resource-group <RESOURCE_GROUP> \
  --container-image-name <ACR_LOGIN_SERVER>/iqcapture-api:latest \
  --container-registry-url https://<ACR_LOGIN_SERVER> \
  --container-registry-user $(az acr credential show --name <ACR_NAME> --query username -o tsv) \
  --container-registry-password $(az acr credential show --name <ACR_NAME> --query "passwords[0].value" -o tsv)
```

Alternatively, if the ACR has admin disabled, use a managed identity:

```bash
az webapp identity assign --name iqcapture-api --resource-group <RESOURCE_GROUP>
az role assignment create \
  --assignee $(az webapp identity show --name iqcapture-api --resource-group <RESOURCE_GROUP> --query principalId -o tsv) \
  --scope $(az acr show --name <ACR_NAME> --query id -o tsv) \
  --role AcrPull
```

---

### Task 4: Configure application settings (environment variables)

**Files:**
- Read: `backend/.env` (local copy — DO NOT commit)
- Read: `backend/.env.example` (for reference)

- [ ] **Step 1: Set required and optional env vars**

Copy values from your local `.env` file. Run as a single command:

```bash
az webapp config appsettings set \
  --name iqcapture-api \
  --resource-group <RESOURCE_GROUP> \
  --settings \
    JWT_SECRET="<your-jwt-secret>" \
    MONGODB_URI="<your-mongodb-uri>" \
    SENDGRID_API_KEY="<your-sendgrid-key>" \
    SENDGRID_FROM_EMAIL="noreply@meetily.app" \
    CORS_ORIGINS="*" \
    DEEPGRAM_API_KEY="<your-deepgram-key>" \
    OPENAI_API_KEY="<your-openai-key>" \
    ANTHROPIC_API_KEY="<your-anthropic-key>" \
    WEBSITES_PORT="5167"
```

Alternatively, paste as JSON in the Azure Portal: **Web App → Settings → Environment variables → Advanced edit**:

```json
[
  { "name": "JWT_SECRET", "value": "<your-jwt-secret>" },
  { "name": "MONGODB_URI", "value": "<your-mongodb-uri>" },
  { "name": "SENDGRID_API_KEY", "value": "<your-sendgrid-key>" },
  { "name": "SENDGRID_FROM_EMAIL", "value": "noreply@meetily.app" },
  { "name": "CORS_ORIGINS", "value": "*" },
  { "name": "DEEPGRAM_API_KEY", "value": "<your-deepgram-key>" },
  { "name": "OPENAI_API_KEY", "value": "<your-openai-key>" },
  { "name": "ANTHROPIC_API_KEY", "value": "<your-anthropic-key>" },
  { "name": "WEBSITES_PORT", "value": "5167" }
]
```

- [ ] **Step 2: Restart the Web App to pick up settings**

```bash
az webapp restart --name iqcapture-api --resource-group <RESOURCE_GROUP>
```

- [ ] **Step 3: Verify the health endpoint**

Wait 30-60 seconds for the container to start, then:

```bash
curl -s https://iqcapture-api.azurewebsites.net/health
```

Expected: HTTP 200 with health status response.

If it fails, check logs:

```bash
az webapp log tail --name iqcapture-api --resource-group <RESOURCE_GROUP>
```

---

### Task 5: Update mobile app config

**Files:**
- Modify: `mobile/src/services/config.ts:21-24`

- [ ] **Step 1: Update the production API URL**

In `mobile/src/services/config.ts`, change line 22 from:

```typescript
  production: 'https://api.iqcapture.app',
```

To (using the actual Azure hostname from Task 3 Step 3):

```typescript
  production: 'https://iqcapture-api.azurewebsites.net',
```

- [ ] **Step 2: Rebuild the mobile app**

```bash
cd /Users/davidlynes/Documents/meeting-notes/mobile
pnpm run build
npx cap sync ios
```

- [ ] **Step 3: Verify the login screen works**

Deploy to device or simulator and confirm the login screen no longer shows "Load Failed".

- [ ] **Step 4: Commit**

```bash
cd /Users/davidlynes/Documents/meeting-notes
git add mobile/src/services/config.ts
git commit -m "feat: point mobile app at Azure Web App API endpoint"
```

---

### Task 6: Verify end-to-end

**Files:** None (manual testing)

- [ ] **Step 1: Test health endpoint**

```bash
curl -s https://iqcapture-api.azurewebsites.net/health
```

Expected: 200 OK

- [ ] **Step 2: Test auth endpoint**

```bash
curl -s -X POST https://iqcapture-api.azurewebsites.net/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}' | head -20
```

Expected: 401 or error response (not a connection failure or 500).

- [ ] **Step 3: Test from mobile app**

Open the app on a device. Attempt to log in. Confirm:
- No "Load Failed" error
- Auth errors display correctly (wrong password, etc.)
- Registration flow works

- [ ] **Step 4: Push to GitHub**

```bash
git push origin feature/mobile-app
```
