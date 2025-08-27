#!/usr/bin/env tsx

/**
 * RSS Feed Parser for Cayman Journal
 * Parses the RSS feed and updates README.md with latest articles by category
 */

import Parser from 'rss-parser';
import { readFileSync, writeFileSync } from 'fs';
import { format } from 'date-fns';
import { load } from 'cheerio';

const ROOT_RSS_URL = 'https://caymanjournal.com/feed.xml';
const README_PATH = 'README.md';
const ARTICLES_PER_CATEGORY = 10;
const ARTICLES_IN_LATEST = 10;
const START_MARKER = '<!-- FEED:START -->';
const END_MARKER = '<!-- FEED:END -->';

const CATEGORY_FEEDS: Array<{ name: string; feedUrl: string }> = [
  // { name: 'Real Estate', feedUrl: 'https://caymanjournal.com/categories/real-estate/feed.xml' },
  // { name: 'Yacht', feedUrl: 'https://caymanjournal.com/categories/yacht/feed.xml' },
  { name: 'Business', feedUrl: 'https://caymanjournal.com/categories/business/feed.xml' },
  { name: 'Economy', feedUrl: 'https://caymanjournal.com/categories/economy/feed.xml' },
  { name: 'Markets & Finance', feedUrl: 'https://caymanjournal.com/categories/markets-finance/feed.xml' },
  { name: 'Technology', feedUrl: 'https://caymanjournal.com/categories/technology/feed.xml' }
];

interface Article {
  title: string;
  link: string;
  description: string;
  date: string;
  category: string;
}

interface CategorizedArticles {
  [category: string]: Article[];
}

interface RSSItem extends Parser.Item {
  categories?: string[];
  category?: string;
}

const parser = new Parser<any, RSSItem>({
  customFields: {
    item: ['category', 'categories']
  }
});

/**
 * Fetch and parse an RSS feed by URL
 */
async function fetchAndParseRss(rssUrl: string): Promise<RSSItem[]> {
  try {
    console.log(`🔄 Fetching RSS feed → ${rssUrl}`);
    const feed = await parser.parseURL(rssUrl);
    
    if (!feed.items || feed.items.length === 0) {
      console.log(`❌ No entries found in RSS feed: ${rssUrl}`);
      return [];
    }
    
    console.log(`✅ Successfully parsed ${feed.items.length} articles from ${rssUrl}`);
    return feed.items;
  } catch (error) {
    console.error(`❌ Error fetching RSS feed (${rssUrl}):`, error);
    return [];
  }
}

/**
 * Clean HTML content and extract plain text
 */
function cleanHtml(htmlContent: string | undefined): string {
  if (!htmlContent) return '';
  
  const $ = load(htmlContent);
  return $.text().trim();
}

/**
 * Get category emoji
 */
function getCategoryEmoji(category: string): string {
  const emojiMap: { [key: string]: string } = {
    'Markets & Finance': '📈',
    'Economy': '🏛️',
    'Technology': '💻',
    'Business': '🏢',
    'Real Estate': '🏠',
    'Yacht': '🛥️',
    'Energy': '⚡',
    'Politics': '🏛️',
    'General': '📰'
  };
  
  return emojiMap[category] || '📰';
}

function mapItemToArticle(entry: RSSItem, fallbackCategory: string): Article {
  let category = fallbackCategory || 'General';
  if (entry.categories && entry.categories.length > 0) {
    category = entry.categories[0];
  } else if (entry.category) {
    category = entry.category;
  }
  category = (category || 'General').trim();

  let publishedDate = '';
  if (entry.pubDate) {
    try {
      const date = new Date(entry.pubDate);
      publishedDate = format(date, 'MMMM dd, yyyy');
    } catch (error) {
      console.warn(`Failed to parse date: ${entry.pubDate}`);
    }
  }

  const title = cleanHtml(entry.title) || 'No Title';
  let description = cleanHtml(entry.contentSnippet || entry.content) || '';
  if (description.length > 150) {
    description = description.substring(0, 150) + '...';
  }

  return { title, link: entry.link || '', description, date: publishedDate, category };
}

async function fetchLatestAndCategories(): Promise<{ latestArticles: Article[]; categorizedArticles: CategorizedArticles }> {
  const rootEntries = await fetchAndParseRss(ROOT_RSS_URL);
  const latestArticles = rootEntries
    .map((e) => mapItemToArticle(e, 'General'))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, ARTICLES_IN_LATEST);

  const categorizedArticles: CategorizedArticles = {};
  for (const { name, feedUrl } of CATEGORY_FEEDS) {
    const items = await fetchAndParseRss(feedUrl);
    const articles = items
      .map((e) => mapItemToArticle(e, name))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, ARTICLES_PER_CATEGORY);
    categorizedArticles[name] = articles;
  }

  return { latestArticles, categorizedArticles };
}

/**
 * Generate the articles section for README
 */
function generateArticlesSection(latestArticles: Article[], categorizedArticles: CategorizedArticles): string {
  const out: string[] = [];

  out.push('## 🆕 Latest 10 Articles\n');
  if (latestArticles.length === 0) {
    out.push('No latest articles available.');
  } else {
    for (const a of latestArticles) {
      let line = `- **[${a.title}](${a.link})**`;
      if (a.date) line += ` *(${a.date})*`;
      if (a.description) line += `  \n  ${a.description}`;
      out.push(line);
    }
  }

  out.push('');

  // Keep a fixed ordering of categories
  for (const { name } of CATEGORY_FEEDS) {
    const list = categorizedArticles[name] || [];
    if (list.length === 0) continue;
    const emoji = getCategoryEmoji(name);
    out.push(`### ${emoji} ${name}\n`);
    for (const a of list) {
      let line = `- **[${a.title}](${a.link})**`;
      if (a.date) line += ` *(${a.date})*`;
      if (a.description) line += `  \n  ${a.description}`;
      out.push(line);
    }
    out.push('');
  }

  return out.join('\n');
}

/**
 * Update the README.md file with new articles
 */
function updateReadme(latestArticles: Article[], categorizedArticles: CategorizedArticles): boolean {
  try {
    const content = readFileSync(README_PATH, 'utf-8');
    
    // Generate new articles section
    const articlesSection = generateArticlesSection(latestArticles, categorizedArticles);
    
    // Current timestamp
    const updateTime = format(new Date(), "MMMM dd, yyyy 'at' HH:mm 'UTC'");

    const newBlock = `${START_MARKER}\n\n## 📰 Latest Articles\n\n${articlesSection}\n\n*Last updated: ${updateTime}*\n\n${END_MARKER}`;

    let newContent: string;
    if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
      const before = content.split(START_MARKER)[0];
      const after = content.split(END_MARKER)[1] || '';
      newContent = before.trimEnd() + '\n' + newBlock + after;
    } else {
      newContent = content.trimEnd() + '\n\n' + newBlock + '\n';
    }

    // Write updated content
    writeFileSync(README_PATH, newContent, 'utf-8');

    const totalArticles = latestArticles.length + Object.values(categorizedArticles).reduce((sum, list) => sum + list.length, 0);
    console.log(`✅ README.md updated successfully with ${totalArticles} items`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error updating README:`, error);
    return false;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Cayman Journal README update...');

  const { latestArticles, categorizedArticles } = await fetchLatestAndCategories();

  console.log(`📊 Latest: ${latestArticles.length} articles`);
  for (const [category, articles] of Object.entries(categorizedArticles)) {
    console.log(`  - ${category}: ${articles.length} articles`);
  }

  // Update README
  const success = updateReadme(latestArticles, categorizedArticles);

  if (success) {
    console.log('🎉 README update completed successfully!');
  } else {
    console.log('❌ README update failed!');
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}
