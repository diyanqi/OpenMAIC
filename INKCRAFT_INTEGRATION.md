# Inkcraft OAuth and Classroom Creation

MAIC browser users authenticate through Inkcraft OAuth. If a user opens MAIC without a valid session, MAIC redirects to Inkcraft OAuth and returns to the original MAIC URL after login.

## MAIC Environment

```bash
INKCRAFT_OAUTH_BASE_URL=https://www.inkcraft.cn
INKCRAFT_OAUTH_CLIENT_ID=...
INKCRAFT_OAUTH_CLIENT_SECRET=...
INKCRAFT_OAUTH_SESSION_SECRET=...
INKCRAFT_INTEGRATION_SECRET=...
MAIC_PUBLIC_URL=https://<maic-host>
DEFAULT_MODEL=...
```

Register this OAuth redirect URI in Inkcraft:

```text
https://<maic-host>/api/auth/callback
```

If the server is bound to `0.0.0.0` or sits behind a reverse proxy, set either
`MAIC_PUBLIC_URL` or the exact `INKCRAFT_OAUTH_REDIRECT_URI` so OAuth callbacks
and post-login redirects use the public MAIC host.

OAuth endpoints used by MAIC:

```text
Discovery: /.well-known/oauth-authorization-server
Authorize:  /oauth/authorize
Token:      /oauth/token
UserInfo:   /oauth/userinfo
```

## Server-to-Server Classroom Creation

Inkcraft server calls:

```http
POST https://<maic-host>/api/inkcraft/classrooms
Authorization: Bearer <INKCRAFT_INTEGRATION_SECRET>
Content-Type: application/json
```

Request body:

```json
{
  "prompt": "用 20 分钟讲清楚牛顿第二定律",
  "user": {
    "id": "ink_user_123",
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

Async response:

```json
{
  "success": true,
  "jobId": "abc123",
  "status": "queued",
  "step": "queued",
  "statusUrl": "https://<maic-host>/api/inkcraft/classrooms/abc123",
  "pollUrl": "https://<maic-host>/api/inkcraft/classrooms/abc123",
  "pollIntervalMs": 5000,
  "classroomUrl": null
}
```

Poll `pollUrl` with the same `Authorization` header until `done` is true:

```json
{
  "success": true,
  "jobId": "abc123",
  "status": "succeeded",
  "done": true,
  "classroomId": "course123",
  "classroomUrl": "https://<maic-host>/classroom/course123",
  "scenesCount": 8
}
```

Return `classroomUrl` to the Inkcraft frontend. When the browser navigates to it, MAIC will require OAuth if the user is not already logged in.

## Optional Fields

```json
{
  "wait": false,
  "enableWebSearch": false,
  "enableImageGeneration": false,
  "enableVideoGeneration": false,
  "enableTTS": false,
  "agentMode": "default"
}
```

`wait=true` makes the create request wait for generation and return the classroom URL directly. This may exceed upstream HTTP timeouts for long courses, so the async polling flow is recommended.

`user` can also be a string user id:

```json
{
  "prompt": "讲解傅里叶变换",
  "user": "ink_user_123"
}
```
