# Super Mario Maker (Wii U) on Juxtaposition

What the game needs from Miiverse, what this server already does for it, and what has not been
seen on a console yet.

## What is known

- The game talks to Miiverse through the normal olive API with its own title ID (paramPack
  `title_id`, decimal): `000500001018DA00` (JPN), `000500001018DB00` (USA), `000500001018DC00`
  (EUR). All three share one community.
- The course site of the original game linked every course to a Miiverse post (the old Bookmark
  site showed `miiversePostUrl` per course), and the game keeps a per-course comment counter on
  the course object itself (object rating slot 6, "miiverse_comments" in Pretendo's course
  archiver). The counter is the game's own bookkeeping on the NEX side; Miiverse does not
  maintain it.
- Pretendo's server stores `app_data`, `search_key` and `topic_tag` on every post and filters
  posts by `search_key` (`GET /v1/communities/:id/posts?search_key=`), which is the generic way a
  game ties a post to something of its own, such as a course.

## What is not known

Whether the game puts the course ID in `search_key`, in `app_data`, or both, and whether comments
are replies to one post per course or separate posts in the title community. The earlier
assumption of one community per course does not fit this server: a game may create at most 4
sub-communities per title (`POST /v1/communities`), and a maker uploads up to 100 courses. Capture
a comment and a clear post from a real console (the post body shows `search_key`, `app_data`,
`topic_tag` and `community_id`) and write the answer here.

## What this repository does

- `services/communities/title-communities.ts` describes the Super Mario Maker community and creates
  it when no community owns one of its title IDs. Production has no communities yet, so a console
  cannot post until this runs. Call `ensureTitleCommunities` from the seed entry once it lands.
  The seed has a placeholder icon: replace it from the admin panel.
- Players cannot create sub-communities in it (`minimum_new_community_access_level` 3).
