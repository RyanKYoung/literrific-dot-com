#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

if (!WEBFLOW_API_TOKEN || !WEBFLOW_COLLECTION_ID) {
  console.error('Missing required environment variables: WEBFLOW_API_TOKEN, WEBFLOW_COLLECTION_ID');
  process.exit(1);
}

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function getExistingItems() {
  const res = await fetch(`${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items`, {
    headers: {
      Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
      'accept-version': '1.0.0',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch items: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.items || [];
}

async function createItem(fieldData) {
  const res = await fetch(`${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
      'Content-Type': 'application/json',
      'accept-version': '1.0.0',
    },
    body: JSON.stringify({ isArchived: false, isDraft: false, fieldData }),
  });
  if (!res.ok) throw new Error(`Failed to create item: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateItem(itemId, fieldData) {
  const res = await fetch(`${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
      'Content-Type': 'application/json',
      'accept-version': '1.0.0',
    },
    body: JSON.stringify({ isArchived: false, isDraft: false, fieldData }),
  });
  if (!res.ok) throw new Error(`Failed to update item: ${res.status} ${await res.text()}`);
  return res.json();
}

async function publishItems(itemIds) {
  const res = await fetch(`${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
      'Content-Type': 'application/json',
      'accept-version': '1.0.0',
    },
    body: JSON.stringify({ itemIds }),
  });
  if (!res.ok) throw new Error(`Failed to publish items: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const postsDir = path.join(process.cwd(), 'posts');
  const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

  if (files.length === 0) {
    console.log('No posts found.');
    return;
  }

  console.log(`Found ${files.length} post(s). Fetching existing Webflow items...`);
  const existingItems = await getExistingItems();
  const existingBySlug = Object.fromEntries(
    existingItems.map(item => [item.fieldData?.slug, item])
  );

  const publishedIds = [];

  for (const file of files) {
    const filePath = path.join(postsDir, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content } = matter(raw);

    const slug = slugify(frontmatter.title || path.basename(file, '.md'));
    const html = marked(content);

    if (!frontmatter.category) {
      console.error(`Skipping "${frontmatter.title}": missing required "category" field in frontmatter (must be a Webflow category item ID)`);
      continue;
    }

    const fieldData = {
      name: frontmatter.title,
      slug,
      'post-body': html,
      'post-summary': frontmatter.summary || '',
      category: frontmatter.category,
    };

    const existing = existingBySlug[slug];

    if (existing) {
      console.log(`Updating: ${frontmatter.title}`);
      const updated = await updateItem(existing.id, fieldData);
      publishedIds.push(updated.id);
    } else {
      console.log(`Creating: ${frontmatter.title}`);
      const created = await createItem(fieldData);
      publishedIds.push(created.id);
    }
  }

  if (publishedIds.length > 0) {
    console.log(`Publishing ${publishedIds.length} item(s)...`);
    await publishItems(publishedIds);
    console.log('Done.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
