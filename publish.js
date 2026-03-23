name: Publish to Webflow CMS

on:
  push:
    paths:
      - 'posts/**'
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Publish posts to Webflow
        env:
          WEBFLOW_API_TOKEN: ${{ secrets.WEBFLOW_API_TOKEN }}
          WEBFLOW_COLLECTION_ID: ${{ secrets.WEBFLOW_COLLECTION_ID }}
        run: node scripts/publish.js
