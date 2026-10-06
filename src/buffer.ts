const BUFFER_API = "https://api.buffer.com";

export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.BUFFER_API_KEY;
  if (!key) throw new Error("Falta BUFFER_API_KEY");

  const res = await fetch(BUFFER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Buffer ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data as T;
}

type CreatePostInput = {
  channelId: string;
  text: string;
  imageUrl?: string;
  instagram?: boolean;
};

export async function createPost({ channelId, text, imageUrl, instagram }: CreatePostInput) {
  const input: Record<string, unknown> = {
    channelId,
    text,
    schedulingType: "automatic",
    mode: "addToQueue", // usa los horarios que configures en Buffer
  };
  if (imageUrl) input.assets = [{ image: { url: imageUrl } }];
  if (instagram) {
    input.metadata = { instagram: { type: "post", shouldShareToFeed: true } };
  }

  const data = await gql(
    `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id dueAt } }
        ... on MutationError { message }
      }
    }`,
    { input },
  );

  const r = data.createPost;
  if (r.message) throw new Error(`Buffer createPost: ${r.message}`);
  return r.post as { id: string; dueAt: string };
}
