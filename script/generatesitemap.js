const SitemapGenerator = require('sitemap-generator');

var generator = SitemapGenerator('http://sch22.edu.vn.ua', {
  filepath: './originsitemap.xml',
  lastMod: true
});

// register event listeners
generator.on('done', () => {
  console.log('Done')
});

// start the crawler
generator.start();