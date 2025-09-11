name: CFBD Data Pull
on:
  workflow_dispatch:
  schedule:
    - cron: "5 12 * * *"  # daily @ 12:05 UTC
permissions:
  contents: write

jobs:
  pull:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }

      - name: Fetch CFBD data
        env:
          CFBD_API_KEY: ${{ secrets.CFBD_API_KEY }}
        run: node scripts/fetch-cfbd.mjs

      - name: Commit data (if changed)
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data
          git diff --staged --quiet || git commit -m "CFBD data update"
          git push
