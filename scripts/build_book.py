"""Build the readable HTML from the author's Markdown; no third-party packages."""
from pathlib import Path
import hashlib
import html
import json
import re
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '32 страницы о моем отце.md'

def chapter_image(date, images):
    record = images.get(date, {})
    filename = record.get('file', '')
    directory = (ROOT / 'assets/images/chapters').resolve()
    candidate = (directory / filename).resolve()
    if filename and (not candidate.is_relative_to(directory) or candidate.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp', '.avif')):
        raise ValueError(f'Недопустимый файл изображения для главы {date}: {filename}')
    has_image = bool(filename and candidate.is_file())
    if has_image:
        src = '../assets/images/chapters/' + quote(filename, safe='/')
        alt = record.get('alt') or f'Фотография к главе «{date}»'
        visual = f'<img src="{html.escape(src, quote=True)}" alt="{html.escape(alt, quote=True)}" loading="lazy" decoding="async">'
        caption = record.get('caption', '')
        if caption:
            visual += f'<figcaption>{html.escape(caption)}</figcaption>'
    else:
        visual = '<span class="chapter-image-placeholder" role="img" aria-label="Место для изображения к главе"><span aria-hidden="true">＋</span><span>Место для изображения</span></span>'
    image_class = 'chapter-image' if has_image else 'chapter-image is-empty'
    return f'          <figure class="{image_class}" data-chapter="{html.escape(date, quote=True)}">{visual}</figure>'

def read_pages():
    source = SOURCE.read_text(encoding='utf-8')
    chunks = re.split(r'^## Страница (\d+)\s*\n', source, flags=re.M)
    pages = []
    for i in range(1, len(chunks), 2):
        number = int(chunks[i])
        body = re.sub(r'<!--.*?-->', '', chunks[i + 1], flags=re.S).strip()
        blocks = []
        for block in re.split(r'\n\s*\n', body):
            if block.startswith('### '):
                blocks.append(('h3', block[4:]))
            elif block.strip():
                blocks.append(('p', block))
        pages.append((number, blocks))
    if not pages or [number for number, _ in pages] != list(range(1, len(pages) + 1)):
        raise ValueError('Нумерация в Markdown должна идти подряд, начиная с 1.')
    return pages

def build():
    pages = read_pages()
    images_path = ROOT / 'content/chapter-images.json'
    images = json.loads(images_path.read_text(encoding='utf-8')) if images_path.exists() else {}
    articles, toc, options = [], [], []
    for number, blocks in pages:
        headings = [text for tag, text in blocks if tag == 'h3']
        dates = [h for h in headings if re.fullmatch(r'\d{1,2} [а-яё]+', h)]
        rendered = []
        for tag, text in blocks:
            attributes = ' class="chapter-date"' if tag == 'h3' and text in dates else ''
            rendered.append(f'          <{tag}{attributes}>{html.escape(text)}</{tag}>')
            if tag == 'h3' and text in dates:
                rendered.append(chapter_image(text, images))
        content = '\n'.join(rendered)
        articles.append(f'''      <article class="book-page" id="page-{number}" aria-label="Страница {number}" tabindex="-1">
        <div class="page-content">
{content}
        </div>
        <a class="page-number" href="#page-{number}" aria-label="Ссылка на страницу {number}">{number:02d}</a>
      </article>''')
        for date in dates:
            toc.append(f'        <li><a href="#page-{number}">{html.escape(date)}</a></li>')
        options.append(f'            <option value="{number}">{number}</option>')
    template = (ROOT / 'templates/book.html').read_text(encoding='utf-8')
    asset_versions = {
        'BOOK_CSS_VERSION': hashlib.sha256((ROOT / 'assets/css/book.css').read_bytes()).hexdigest()[:12],
        'BOOK_JS_VERSION': hashlib.sha256((ROOT / 'assets/js/book.js').read_bytes()).hexdigest()[:12],
    }
    for key, value in {'PAGES': '\n'.join(articles), 'TOC': '\n'.join(toc), 'OPTIONS': '\n'.join(options), 'COUNT': str(len(pages)), **asset_versions}.items():
        template = template.replace('{{' + key + '}}', value)
    (ROOT / 'book').mkdir(exist_ok=True)
    (ROOT / 'book/index.html').write_text(template, encoding='utf-8')
    print(f'Готово: book/index.html — {len(pages)} страниц из авторского Markdown.')

if __name__ == '__main__':
    build()
