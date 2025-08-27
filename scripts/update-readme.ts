#!/usr/bin/env tsx

/**
 * RSS Feed Parser for Cayman Journal
 * Parses the RSS feed and updates README.md with latest articles by category
 */

import Parser from 'rss-parser';
import { readFileSync, writeFileSync } from 'fs';
import { format } from 'date-fns';
import { load } from 'cheerio';

const RSS_URL = 'https://caymanjournal.com/feed.xml';
const README_PATH = 'README.md';
const ARTICLES_PER_CATEGORY = 5;

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
 * Fetch and parse the RSS feed
 */
async function fetchAndParseRss(): Promise<RSSItem[]> {
  try {
    console.log('🔄 Fetching RSS feed from Cayman Journal...');
    
    const feed = await parser.parseURL(RSS_URL);
    
    if (!feed.items || feed.items.length === 0) {
      console.log('❌ No entries found in RSS feed');
      return [];
    }
    
    console.log(`✅ Successfully parsed ${feed.items.length} articles`);
    return feed.items;
  } catch (error) {
    console.error(`❌ Error fetching RSS feed:`, error);
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
    'Energy': '⚡',
    'Politics': '🏛️',
    'General': '📰'
  };
  
  return emojiMap[category] || '📰';
}

/**
 * Categorize articles and return top articles per category
 */
function categorizeArticles(entries: RSSItem[]): CategorizedArticles {
  const categories: CategorizedArticles = {};
  
  for (const entry of entries) {
    // Get category from RSS feed
    let category = 'General';
    
    if (entry.categories && entry.categories.length > 0) {
      category = entry.categories[0];
    } else if (entry.category) {
      category = entry.category;
    }
    
    // Clean up category names
    category = category.replace('&', 'and').trim();
    
    // Parse date
    let publishedDate = '';
    if (entry.pubDate) {
      try {
        const date = new Date(entry.pubDate);
        publishedDate = format(date, 'MMMM dd, yyyy');
      } catch (error) {
        console.warn(`Failed to parse date: ${entry.pubDate}`);
      }
    }
    
    // Clean title and description
    const title = cleanHtml(entry.title) || 'No Title';
    let description = cleanHtml(entry.contentSnippet || entry.content) || '';
    
    // Truncate description if too long
    if (description.length > 150) {
      description = description.substring(0, 150) + '...';
    }
    
    const article: Article = {
      title,
      link: entry.link || '',
      description,
      date: publishedDate,
      category
    };
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    categories[category].push(article);
  }
  
  // Sort articles by date (newest first) and limit per category
  for (const category in categories) {
    categories[category] = categories[category]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, ARTICLES_PER_CATEGORY);
  }
  
  return categories;
}

/**
 * Generate the articles section for README
 */
function generateArticlesSection(categorizedArticles: CategorizedArticles): string {
  if (Object.keys(categorizedArticles).length === 0) {
    return 'No articles available at the moment.';
  }
  
  const articlesMd: string[] = [];
  
  // Sort categories by number of articles (descending)
  const sortedCategories = Object.entries(categorizedArticles)
    .sort(([, a], [, b]) => b.length - a.length);
  
  for (const [category, articles] of sortedCategories) {
    if (articles.length === 0) continue;
    
    // Category header with emoji
    const categoryEmoji = getCategoryEmoji(category);
    articlesMd.push(`### ${categoryEmoji} ${category}\n`);
    
    for (const article of articles) {
      const { title, link, description, date } = article;
      
      // Create article entry with better formatting
      let articleEntry = `**[${title}](${link})**`;
      if (date) {
        articleEntry += ` *(${date})*`;
      }
      if (description) {
        articleEntry += `  \n${description}`;
      }
      
      articlesMd.push(`- ${articleEntry}\n`);
    }
    
    articlesMd.push(''); // Add spacing between categories
  }
  
  return articlesMd.join('\n');
}

/**
 * Update the README.md file with new articles
 */
function updateReadme(categorizedArticles: CategorizedArticles): boolean {
  try {
    const content = readFileSync(README_PATH, 'utf-8');
    
    // Generate new articles section
    const articlesSection = generateArticlesSection(categorizedArticles);
    
    // Current timestamp
    const updateTime = format(new Date(), 'MMMM dd, yyyy \'at\' HH:mm \'UTC\'');
    
    // Find the position to insert articles (after "Visit Our Platform" section)
    const platformSectionEnd = content.indexOf('---');
    
    let newContent: string;
    if (platformSectionEnd === -1) {
      // If no separator found, append to end
      newContent = content.trimEnd() + '\n\n';
    } else {
      // Insert before the separator
      newContent = content.substring(0, platformSectionEnd).trimEnd() + '\n\n';
    }
    
    // Add the latest articles section
    newContent += `## 📰 Latest Articles

${articlesSection}

*Last updated: ${updateTime}*

---

*Stay informed with breaking international financial news, global market analysis, investment insights, and economic updates from around the world.*
`;
    
    // Write updated content
    writeFileSync(README_PATH, newContent, 'utf-8');
    
    const totalArticles = Object.values(categorizedArticles)
      .reduce((sum, articles) => sum + articles.length, 0);
    
    console.log(`✅ README.md updated successfully with ${totalArticles} articles`);
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
  
  // Fetch and parse RSS feed
  const entries = await fetchAndParseRss();
  if (entries.length === 0) {
    console.log('❌ No articles to process');
    process.exit(1);
  }
  
  // Categorize articles
  const categorizedArticles = categorizeArticles(entries);
  
  if (Object.keys(categorizedArticles).length === 0) {
    console.log('❌ No categorized articles found');
    process.exit(1);
  }
  
  console.log(`📊 Found articles in ${Object.keys(categorizedArticles).length} categories:`);
  for (const [category, articles] of Object.entries(categorizedArticles)) {
    console.log(`  - ${category}: ${articles.length} articles`);
  }
  
  // Update README
  const success = updateReadme(categorizedArticles);
  
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
