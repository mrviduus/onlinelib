-- Idempotent seed data script for sample books
-- Run with: psql -h localhost -U app -d books -f seed-books.sql

-- Book 1: The Great Gatsby
INSERT INTO works (id, site_id, slug, created_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'the-great-gatsby', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, is_public_domain, created_at, updated_at)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'en',
    'the-great-gatsby',
    'The Great Gatsby',
    'A novel about the mysterious millionaire Jay Gatsby and his obsession with the beautiful Daisy Buchanan.',
    '["F. Scott Fitzgerald"]',
    1, NOW(), true, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    1, 'chapter-1', 'Chapter 1',
    '<p>In my younger and more vulnerable years my father gave me some advice that I''ve been turning over in my mind ever since.</p><p>"Whenever you feel like criticizing anyone," he told me, "just remember that all the people in this world haven''t had the advantages that you''ve had."</p>',
    'In my younger and more vulnerable years my father gave me some advice that I''ve been turning over in my mind ever since. Whenever you feel like criticizing anyone, he told me, just remember that all the people in this world haven''t had the advantages that you''ve had.',
    50, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    2, 'chapter-2', 'Chapter 2',
    '<p>About half way between West Egg and New York the motor road hastily joins the railroad and runs beside it for a quarter of a mile.</p><p>This is a valley of ashes - a fantastic farm where ashes grow like wheat into ridges and hills and grotesque gardens.</p>',
    'About half way between West Egg and New York the motor road hastily joins the railroad and runs beside it for a quarter of a mile. This is a valley of ashes - a fantastic farm where ashes grow like wheat into ridges and hills and grotesque gardens.',
    50, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    3, 'chapter-3', 'Chapter 3',
    '<p>There was music from my neighbor''s house through the summer nights. In his blue gardens men and girls came and went like moths among the whisperings and the champagne and the stars.</p>',
    'There was music from my neighbor''s house through the summer nights. In his blue gardens men and girls came and went like moths among the whisperings and the champagne and the stars.',
    35, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Book 2: Frankenstein
INSERT INTO works (id, site_id, slug, created_at)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', 'frankenstein', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, is_public_domain, created_at, updated_at)
VALUES (
    '11111111-2222-3333-4444-555555555555',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '11111111-1111-1111-1111-111111111111',
    'en',
    'frankenstein',
    'Frankenstein; or, The Modern Prometheus',
    'The story of Victor Frankenstein, a young scientist who creates a sapient creature in an unorthodox scientific experiment.',
    '["Mary Shelley"]',
    1, NOW(), true, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    '22222222-3333-4444-5555-666666666666',
    '11111111-2222-3333-4444-555555555555',
    1, 'letter-1', 'Letter 1',
    '<p>To Mrs. Saville, England.</p><p>You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings.</p>',
    'To Mrs. Saville, England. You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings.',
    30, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    '33333333-4444-5555-6666-777777777777',
    '11111111-2222-3333-4444-555555555555',
    2, 'letter-2', 'Letter 2',
    '<p>To Mrs. Saville, England.</p><p>How slowly the time passes here, encompassed as I am by frost and snow! Yet a second step is taken towards my enterprise.</p>',
    'To Mrs. Saville, England. How slowly the time passes here, encompassed as I am by frost and snow! Yet a second step is taken towards my enterprise.',
    30, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    '44444444-5555-6666-7777-888888888888',
    '11111111-2222-3333-4444-555555555555',
    3, 'chapter-1', 'Chapter 1',
    '<p>I am by birth a Genevese, and my family is one of the most distinguished of that republic. My ancestors had been for many years counsellors and syndics.</p>',
    'I am by birth a Genevese, and my family is one of the most distinguished of that republic. My ancestors had been for many years counsellors and syndics.',
    30, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Book 3: Clean Code (Programming site)
INSERT INTO works (id, site_id, slug, created_at)
VALUES ('aaaaaaaa-1111-2222-3333-444444444444', '22222222-2222-2222-2222-222222222222', 'clean-code', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, is_public_domain, created_at, updated_at)
VALUES (
    'bbbbbbbb-1111-2222-3333-444444444444',
    'aaaaaaaa-1111-2222-3333-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'en',
    'clean-code',
    'Clean Code: A Handbook of Agile Software Craftsmanship',
    'A guide to writing clean, readable, and maintainable code.',
    '["Robert C. Martin"]',
    1, NOW(), false, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    'cccccccc-1111-2222-3333-444444444444',
    'bbbbbbbb-1111-2222-3333-444444444444',
    1, 'clean-code', 'Clean Code',
    '<p>Writing clean code requires discipline. It takes effort to keep code clean. You need to practice and fail and watch yourself fail. You need to see others fail.</p>',
    'Writing clean code requires discipline. It takes effort to keep code clean. You need to practice and fail and watch yourself fail. You need to see others fail.',
    30, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    'dddddddd-1111-2222-3333-444444444444',
    'bbbbbbbb-1111-2222-3333-444444444444',
    2, 'meaningful-names', 'Meaningful Names',
    '<p>Names are everywhere in software. We name our variables, functions, arguments, classes, and packages. Because we do so much of it, we''d better do it well.</p>',
    'Names are everywhere in software. We name our variables, functions, arguments, classes, and packages. Because we do so much of it, we''d better do it well.',
    30, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Book 4: The Pragmatic Programmer (Programming site)
INSERT INTO works (id, site_id, slug, created_at)
VALUES ('eeeeeeee-1111-2222-3333-444444444444', '22222222-2222-2222-2222-222222222222', 'pragmatic-programmer', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, is_public_domain, created_at, updated_at)
VALUES (
    'ffffffff-1111-2222-3333-444444444444',
    'eeeeeeee-1111-2222-3333-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'en',
    'pragmatic-programmer',
    'The Pragmatic Programmer: Your Journey to Mastery',
    'A guide to becoming a better programmer through pragmatic approaches.',
    '["David Thomas", "Andrew Hunt"]',
    1, NOW(), false, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    '11111111-aaaa-bbbb-cccc-dddddddddddd',
    'ffffffff-1111-2222-3333-444444444444',
    1, 'pragmatic-philosophy', 'A Pragmatic Philosophy',
    '<p>What makes a Pragmatic Programmer? Each developer is unique, with individual strengths and weaknesses, preferences and dislikes.</p>',
    'What makes a Pragmatic Programmer? Each developer is unique, with individual strengths and weaknesses, preferences and dislikes.',
    20, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
VALUES (
    '22222222-aaaa-bbbb-cccc-dddddddddddd',
    'ffffffff-1111-2222-3333-444444444444',
    2, 'pragmatic-approach', 'A Pragmatic Approach',
    '<p>There are certain tips and tricks that apply at all levels of software development, processes that are virtually universal, and ideas that are almost axiomatic.</p>',
    'There are certain tips and tricks that apply at all levels of software development, processes that are virtually universal, and ideas that are almost axiomatic.',
    25, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

SELECT 'Seed complete: 4 books (2 general, 2 programming) with 10 chapters total' AS result;
