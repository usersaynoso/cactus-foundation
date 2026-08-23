# chatwoot-image: publish the de-branded build publicly (GHCR)

**Why.** `live-chat` 0.1.20 provisions new chat servers from
`ghcr.io/cactus-foundation-modules/chatwoot:latest` (overridable by the
`LIVECHAT_IMAGE` env var or the setup form). Until the image repo actually
pushes there, any install other than Deskwell that presses *Build my chat
server* gets a Fly "image not found" at the `prepare` step. Deskwell is not
affected: its machine was built by hand and keeps `registry.fly.io/deskwell-chat`
(machine updates reuse the machine's existing image, see
`app/api/admin/machine/route.ts`).

**What to do** (repo `cactus-foundation-modules/chatwoot-image`, needs a push -
not done from here):

1. Apply the workflow change below to `.github/workflows/build.yml`. It keeps the
   Fly push exactly as it is and adds a GHCR push with the same two tags.
2. After the first successful run, make the package public: GitHub → the org's
   Packages → `chatwoot` → Package settings → Change visibility → Public.
   (Fly pulls public GHCR images without any credentials.)
3. Optional: point Deskwell's machine at the public image too, so there is one
   build to look after. Not required.

```diff
 permissions:
   contents: read
+  packages: write
@@
+      - name: Tag for GHCR
+        run: |
+          docker tag registry.fly.io/deskwell-chat:latest ghcr.io/cactus-foundation-modules/chatwoot:${{ steps.ver.outputs.tag }}
+          docker tag registry.fly.io/deskwell-chat:latest ghcr.io/cactus-foundation-modules/chatwoot:latest
+
+      - name: Push to GHCR (public image every install can pull)
+        run: |
+          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
+          docker push ghcr.io/cactus-foundation-modules/chatwoot:${{ steps.ver.outputs.tag }}
+          docker push ghcr.io/cactus-foundation-modules/chatwoot:latest
+
       - name: Push to Fly registry
```

The `space-planner-render-worker` package in the same org is the precedent for
a public GHCR image.
