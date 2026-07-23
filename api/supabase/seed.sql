-- Dev-only fixture data. Safe to re-run: uses ON CONFLICT so it never clobbers
-- other local changes and never touches bulk-loaded tables like eo_bmf.

insert into users (github_id, github_username, github_email, name, role)
values
    (1, 'octocat', 'octocat@example.com', 'The Octocat', 'admin'),
    (2, 'monalisa', 'monalisa@example.com', 'Mona Lisa', 'user')
on conflict (github_id) do nothing;
