const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");
const { glob } = require("glob");

const API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;
const API_BASE = "https://api.webflow.com/v2";

if (!API_TOKEN || !COLLECTION_ID) {
  console.error("Missing WEBFLOW_API_TOKEN or WEBFLOW_COLLECTION_ID");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
  accept: "application/json",
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function apiRequest(url, method = "GET", body = null) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();

  if (!res.ok) {
    console.error(`API error ${res.status}:`, JSON.stringify(data, null, 2));
    throw new Error(`API request failed: ${res.status}`);
  }
  return data;
}

async function getExistingItems() {
  const items = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const data = await apiRequest(
      `${API_BASE}/collections/${COLLECTION_ID}/items?offset=${offset}&limit=100`
    );
    items.push(...data.items);
    total = data.pagination.total;
    offset += data.pagination.limit;
  }
  return items;
}

async function publishPost(postPath, existingItems) {
  const raw = fs.readFileSync(postPath, "utf-8");
  const { data: frontmatter, content } = matter(raw);

  const { title, date, summary, author, tags } = frontmatter;

  if (!title) {
    console.warn(`Skipping ${postPath}: missing title`);
    return;
  }

  const slug = slugify(title);
  const htmlContent = await marked(content);

  // Build the field data — adjust field slugs to match YOUR Webflow collection
  const fieldData = {
    name: title,
    slug: slug,
    "post-body": htmlContent,
    "post-summary": summary || "",
    author: author || "",
    // Webflow expects date as ISO string
    ...(date && { date: new Date(date).toISOString() }),
    // Tags: if your Webflow collection has a plain text tag field
    ...(tags && { tags: Array.isArray(tags) ? tags.join(", ") : tags }),
  };

  // Check if post already exists (match by slug)
  const existing = existingItems.find(
    (item) => item.fieldData?.slug === slug
  );

  if (existing) {
    console.log(`Updating: "${title}" (${existing.id})`);
    await apiRequest(
      `${API_BASE}/collections/${COLLECTION_ID}/items/${existing.id}`,
      "PATCH",
      { fieldData }
    );
  } else {
    console.log(`Creating: "${title}"`);
    await apiRequest(
      `${API_BASE}/collections/${COLLECTION_ID}/items`,
      "POST",
      { fieldData }
    );
  }

  console.log(`✓ ${title}`);
}

async function main() {
  const postFiles = await glob("posts/**/*.md");

  if (postFiles.length === 0) {
    console.log("No markdown files found in /posts");
    return;
  }

  console.log(`Found ${postFiles.length} post(s)`);

  const existingItems = await getExistingItems();
  console.log(`${existingItems.length} existing item(s) in Webflow collection`);

  for (const postFile of postFiles) {
    try {
      await publishPost(postFile, existingItems);
    } catch (err) {
      console.error(`Failed to publish ${postFile}:`, err.message);
    }
  }

  console.log("\nDone!");
}

main();
