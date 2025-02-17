import { existsSync, mkdirSync } from "fs"
import mv from "mv"
import { Context } from "vm"
import { mongo, postgres } from "../app"

export async function storePage(ctx: Context) {
  const { id, url, rawHtml, elements, isCompleted } = ctx.request.body as {
    url: string,
    elements: string,
    id: string,
    rawHtml: string,
    isCompleted: boolean
  }

  console.log("[CRAWL] Webpage Saving", id)
  const elems = JSON.parse(elements)

  let mhtmlFilepath = 'static/mhtml'
  if (!existsSync(mhtmlFilepath)) {
    mkdirSync(mhtmlFilepath, { recursive: true });
  }

  // let screenshotFilepath = 'static/screenshots';
  // if (!existsSync(screenshotFilepath)) {
  //   mkdirSync(screenshotFilepath, { recursive: true });
  // }



  // Handle MHTML file (only with if not already exists)
  if (ctx.request.files && ctx.request.files.mhtml) {
    const mhtmlData = Array.isArray(ctx.request.files.mhtml) ? ctx.request.files.mhtml[0] : ctx.request.files.mhtml;
    const mhtmlPath = mhtmlData.path;
    mhtmlFilepath = `static/mhtml/${id}.mhtml`;
    // check if the page is already saved
    const exist = await mongo.stored.findFirst({
      where: {
        pid: id,
        mhtmlFilePath: mhtmlFilepath
      }
    })
    if (!exist) {
      mv(mhtmlPath, mhtmlFilepath, () => {
        console.log("MHTML file moved!", mhtmlFilepath);
      });
    }
    else {
      console.log("Id already present, not moving mhtml again.")
    }
  }


  // Handle Screenshot file
  // if (ctx.request.files && ctx.request.files.screenshot) {
  //   const screenshotData = Array.isArray(ctx.request.files.screenshot) ? ctx.request.files.screenshot[0] : ctx.request.files.screenshot;
  //   const screenshotPath = screenshotData.path;
  //   screenshotFilepath = `static/screenshots/${id}.png`;
  //   mv(screenshotPath, screenshotFilepath, () => {
  //     console.log("Screenshot file moved!", screenshotFilepath);
  //   });
  // }

  const exist = await mongo.stored.findFirst({
    where: {
      pid: id,
      mhtmlFilePath: mhtmlFilepath
    }
  })

  if (!exist) {
    const dataStore = await postgres.stored.create({
      data: {
        rawHtml: rawHtml,
        elements: elems
      }
    })

    await mongo.stored.create({
      data: {
        pid: id,
        mhtmlFilePath: mhtmlFilepath,
        dataStoreId: dataStore.id
      }
    })
    await mongo.webpage.update({
      where: {
        id: id
      },
      data: {
        savedDate: new Date(),
      }
    })
  }
  else {
    console.log("Id already present, not saving again", id)
  }

  ctx.body = {
    status: 'ok'
  }
}