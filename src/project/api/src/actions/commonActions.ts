import { Context } from "vm"
import { mongo } from "../app"

export async function getSources(ctx: Context) {
  const sources = await mongo.webpage.findMany({
    select: {
      source: true,
    },
    distinct: ["source"]
  });

  console.log("SOURCE", sources);

  const sourceWithSizes = sources.map(async ({ source }) => {
    return await mongo.webpage.count({
      where: { source }
    });
  });

  const sourceWithCurators = sources.map(async ({ source }) => {
    const pageIds = await mongo.webpage.findMany({
      select: {
        id: true,
      },
      where: { source }
    }).then(pages => pages.map(page => page.id));

    const uniqueUserIds = await mongo.answer.groupBy({
      by: ['userId'],
      where: {
        pid: {
          in: pageIds
        }
      }
    });

    return uniqueUserIds.length;
  });

  const sizes = await Promise.all(sourceWithSizes);
  const curators = await Promise.all(sourceWithCurators);

  const results = sources.map((source, index) => {
    return {
      source: source.source,
      size: sizes[index],
      curators: curators[index]
    };
  });

  ctx.body = {
    status: 'ok',
    sources: results
  };
}

export async function getSource(ctx: Context) {
  const sourcename = ctx.params.name
  if (sourcename === undefined) {
    ctx.body = {
      status: 'error',
      message: 'No source name provided'
    }
    return
  }
  const pages = await mongo.webpage.findMany({
    where: { source: sourcename }
  })

  ctx.body = {
    status: 'ok',
    size: pages.length,
    pages: pages
  }
}