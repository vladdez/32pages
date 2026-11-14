"""Verify every author's block and every local website link without external dependencies."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import importlib.util
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_book', ROOT / 'scripts/build_book.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.links = []
        self.articles = []
        self.blocks = None
        self.in_content = False
        self.block_tag = None
        self.block_text = ''
        self.text = []
        self.in_toc = False
        self.toc_links = []
        self.toc_href = None
        self.toc_text = ''
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'nav' and attrs.get('aria-label') == 'Главы книги':
            self.in_toc = True
        if tag == 'a' and self.in_toc:
            self.toc_href = attrs.get('href')
            self.toc_text = ''
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for attr in ('href', 'src'):
            if attr in attrs:
                self.links.append(attrs[attr])
        if tag == 'article' and attrs.get('class') == 'book-page':
            self.blocks = []
            self.articles.append((attrs['id'], self.blocks))
        if tag == 'div' and attrs.get('class') == 'page-content':
            self.in_content = True
        if self.in_content and tag in ('h3', 'p'):
            self.block_tag = tag
            self.block_text = ''
    def handle_data(self, data):
        self.text.append(data)
        if self.toc_href is not None:
            self.toc_text += data
        if self.block_tag:
            self.block_text += data
    def handle_endtag(self, tag):
        if tag == 'a' and self.toc_href is not None:
            self.toc_links.append((self.toc_href, self.toc_text))
            self.toc_href = None
        if tag == 'nav':
            self.in_toc = False
        if tag == self.block_tag:
            self.blocks.append((tag, self.block_text))
            self.block_tag = None
        if tag == 'div' and self.in_content:
            self.in_content = False

parsed = {}
for path in [ROOT / 'index.html', ROOT / 'book/index.html']:
    page = Page()
    page.feed(path.read_text(encoding='utf-8'))
    assert len(page.ids) == len(set(page.ids)), f'Duplicate HTML ID: {path}'
    parsed[path] = page

book = parsed[ROOT / 'book/index.html']
expected = builder.read_pages()
assert len(expected) == len(book.articles) == 32
for (number, blocks), (identifier, rendered) in zip(expected, book.articles):
    assert identifier == f'page-{number}'
    assert blocks == rendered, f'Author text mismatch on page {number}'
assert book.links.count('#page-1') == 2
expected_chapters = [(f'#page-{number}', text) for number, blocks in expected
                     for tag, text in blocks if tag == 'h3' and re.fullmatch(r'\d{1,2} [а-яё]+', text)]
assert book.toc_links == expected_chapters, 'Contents must list only chapter dates and link to their first pages'
assert len(book.toc_links) == 20
for number, _ in expected:
    assert f'#page-{number}' in book.links, f'Missing page permalink: {number}'
for path, page in parsed.items():
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        destination = (path.parent / unquote(url.path)).resolve() if url.path else path
        assert destination.is_file(), f'Missing local file: {link} on {path.name}'
        if url.fragment and destination in parsed:
            assert url.fragment in parsed[destination].ids, f'Missing anchor: {link}'
for path in (ROOT / 'assets/css').glob('*.css'):
    for asset in re.findall(r'url\([\'\"]?([^\)\'\"]+)', path.read_text()):
        assert (path.parent / asset).is_file(), f'Missing CSS asset: {asset}'
assert 'Текст книги будет добавлен' not in ''.join(parsed[ROOT / 'index.html'].text)
assert not any(link in ['#archive', '#between-lines'] for link in parsed[ROOT / 'index.html'].links)
print('PASS: all 32 HTML pages match Markdown block for block; contents, local links and assets are valid.')
