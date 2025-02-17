import { readFileSync, readdirSync } from "fs";
import { Context, Next } from "koa";
import { mongo } from "../app";
import { existsSync, mkdirSync } from "fs"
import mv from "mv"

export async function getPage(ctx: Context, next: Next) {
  const { id } = ctx.params

  const stored = await mongo.stored.findFirst({
    where: {
      pid: id
    }
  })

  if (stored !== null) {
    const { mhtmlFilePath, dataStoreId } = stored

    const file = readFileSync(mhtmlFilePath)
    ctx.set("Content-disposition", `attachment; filename=${id}.mhtml`)
    ctx.statusCode = 200
    ctx.body = file
  } else {
    ctx.body = {
      status: 'error',
      error: 'page not found',
      id: id
    }
    next()
  }
}

export async function postAnswer(ctx: Context) {
  const { id } = ctx.params
  const { tagType, hyuIndex, userId, boundingBox, nodeInfo } = ctx.request.body

  // // screenshot path 
  // let screenshotFilepath = 'static/screenshots_elements';
  // if (!existsSync(screenshotFilepath)) {
  //   mkdirSync(screenshotFilepath, { recursive: true });
  // }
  // // downloads path
  // let downloadFolder = 'downloads';
  // if (!existsSync(downloadFolder)) {
  //   mkdirSync(downloadFolder, { recursive: true });
  // }


  // // Handle Screenshot file
  // // console.log('ctx request files', ctx.request.files)
  // if (ctx.request.files && ctx.request.files.screenshot_element) {
  //   const screenshotData = Array.isArray(ctx.request.files.screenshot_element) ? ctx.request.files.screenshot_element[0] : ctx.request.files.screenshot_element;
  //   const screenshotPath = screenshotData.path;
  //   screenshotFilepath = `static/screenshots_elements/${id}_${hyuIndex}.png`;
  //   mv(screenshotPath, screenshotFilepath, () => {
  //     console.log("Screenshot file moved!", screenshotFilepath);
  //   });
  // } else {
  //   // No file found in request, look in the download folder
  //   console.log('Looking for Screenshot in downloads Folder.')
  //   const files = readdirSync(downloadFolder);
  //   const mhtmlFile = files.find(file => file.endsWith(`${id}.mhtml.png`));
  //   if (mhtmlFile) {
  //     screenshotFilepath = `static/screenshots_elements/${id}_${hyuIndex}.png`;
  //     const screenshotPath = `${downloadFolder}/${mhtmlFile}`;
  //     mv(screenshotPath, screenshotFilepath, () => {
  //       console.log("Screenshot file moved!", screenshotFilepath);
  //     });
  //   } else {
  //     console.log('No Screenshot found in Downloads Folder.')
  //   }
  // }


  const exist = await mongo.answer.findFirst({
    where: {
      pid: id,
      tagType: tagType,
      hyuIndex: hyuIndex,
      userId: userId,
      nodeInfo: nodeInfo,
      // screenshotFilePath: screenshotFilepath,
      boundingBox: boundingBox
    }
  })

  if (!exist) {
    console.log(id)
    console.log(tagType, hyuIndex, userId)

    await mongo.answer.create({
      data: {
        pid: id,
        tagType: tagType,
        hyuIndex: hyuIndex,
        userId: userId,
        nodeInfo: nodeInfo,
        // screenshotFilePath: screenshotFilepath,
        boundingBox: boundingBox

      }
    })
  }

  ctx.body = {
    status: 'ok'
  }
}

export async function updateBoundingBox(ctx: Context) {
  const { answer_id } = ctx.params;
  const { boundingBox} = ctx.request.body;
  

  const exist = await mongo.answer.findFirst({
    where: {
      id: answer_id
    }
  });

  if (exist) {
    await mongo.answer.update({
      where: {
        id: answer_id
      },
      data: {
        boundingBox: boundingBox
      }
    });
  } else {
    console.log("Document not found");
  }
  ctx.body = {
    status: 'ok'
  };
}



export async function deleteAnswer(ctx: Context) {

  console.log('body', ctx.request.body)

  const { id } = ctx.params
  const { tagType, hyuIndex, userId } = ctx.request.body

  console.log('params', ctx.params)

  const exist = await mongo.answer.findFirst({
    where: {
      pid: id,
      tagType: tagType,
      hyuIndex: hyuIndex,
      userId: userId,
    }
  });
  console.log('todelete:', exist)
  if (exist) {
    await mongo.answer.delete({
      where: {
        id: exist.id
      }
    });
    console.log("Document deleted");
  } else {
    console.log("Document not found");
  }

  ctx.body = {
    status: 'ok'
  };
}


export async function getAnswersForDomain(ctx: Context) {
  const { id } = ctx.params
  if (id === undefined) {
    ctx.body = {
      status: 'error',
      message: 'No id provided'
    }
    return
  }

  const webpage = await mongo.webpage.findFirst({
    where: {
      id: id
    }
  })
  if (webpage === null) {
    ctx.body = {
      status: 'error',
      message: 'No webpage found'
    }
    return
  }

  const domain = extractDomain(webpage.url)
  const webpages = await mongo.webpage.findMany({
    where: {
      url: {
        startsWith: domain
      }
    },
    select: {
      id: true // Fetch only the _id of the webpages
    }
  });
  const webpageIds = webpages.map(webpage => webpage.id);


  // Loop Through Webpage IDs
  for (const webpageId of webpageIds) {
    const answers = await mongo.answer.findMany({
      where: {
        pid: webpageId
      }
    });

    if (answers.length > 0) {
      ctx.body = {
        status: 'ok',
        answers: answers
      };
      return;
    }
  }
  ctx.body = {
    status: 'ok',
    message: 'No answers found for the domain',
    answers: []
  };
}

function extractDomain(url: string): string {
  const domainRegex = /^(https?:\/\/(?:www\.)?[^:\/\n]+)/im;
  const matches = url.match(domainRegex);
  if (matches && matches.length > 1) {
    return matches[1];
  }
  throw new Error("Invalid URL");
}
