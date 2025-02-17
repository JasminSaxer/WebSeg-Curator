import { Page } from "../../types"
import { requestContentScript } from "../chromePromise"
import { CrawlConfig, TASK_NAME_CRAWL, getCrawlConfig } from "../../common/configs/crawl"
import { Task, TaskManager } from "../../types/task"
import { resizeWindow } from "../Curation/index"

export class Crawler extends Task {
  public runner: Generator<Page, void, unknown>
  public cursor: Page
  public loadTimedOut = false
  public loadTimeoutId?: NodeJS.Timeout
  constructor(
    public tabId: number,
    public pages: Page[],
    public config: CrawlConfig,
    public requestCallback?: any,
    public responseCallback?: (task: any, message: any, sendResponse?: (response: any) => void) => Promise<void>
  ) {
    super(tabId, pages)
    this.runner = this.run()
    const start = this.runner.next()
    if (!start.done) this.cursor = start.value
    else throw Error("Page length is 1")
  }
  static async create(pages: Page[], requestCallback?: any, responseCallback?: (task: Crawler, data: any) => Promise<void>) {
    return new Promise<Crawler>((resolve, reject) => {
      chrome.tabs.create({ active: true }, tab => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        getCrawlConfig().then(config => {
          resolve(new Crawler(tab.id!, pages, config, requestCallback, responseCallback))
        }).catch(reason => {
          console.warn("Cannot get configuration")
        })
      })
    })
  }
  async startOnNewTab() {
    console.info("Start Crawl on new tab. Mode:", this.config.watch)
    chrome.webNavigation.onCommitted.addListener(this.requestOnTimeout)
    chrome.webNavigation.onCompleted.addListener(this.requestOnComplete)
    chrome.webNavigation.onErrorOccurred.addListener(this.skipFaultyPage)
    await this.open(this.cursor.url, true)
  }
  getUserSelectedIndexes(): string[] {
    const userInput = window.prompt("Enter the indexes to crawl, separated by commas (e.g., 669fd70eb4ce2f35908ef764, or 1,2), or nothing to crawl all:");
    if (!userInput) return []; // No input or cancelled prompt
    return userInput.split(',');
  }

  *run() {
    let filteredPages = this.pages;
    if (this.config.debug) {
      const userSelectedIndexes = this.getUserSelectedIndexes();
      console.info('UserSelection:', userSelectedIndexes)
      filteredPages = [];
      if (userSelectedIndexes.length > 0){
        if (!isNaN(Number(userSelectedIndexes[0])) && Number(userSelectedIndexes[0]) <= 100000) {
          filteredPages = this.pages.filter((_, index) => userSelectedIndexes.includes((index - 1).toString()));
        }else{
        filteredPages = this.pages.filter(page => userSelectedIndexes.includes(page.id));}
      }else{
        filteredPages = this.pages;
      }
    }


    let n_items = filteredPages.length;
    let counter_plus = 1;
    if (this.config.start) {
      const startIndex = Number(this.config.start);
      filteredPages = filteredPages.slice(startIndex - 1);
      counter_plus = startIndex;
    }

    for (const [index, page] of Object.entries(filteredPages)) {
      const counter = Number(index) + counter_plus;
      console.info(`Progress: ${counter} / ${n_items}`)
      yield page
    }

  }

  detachEvents() {
    chrome.webNavigation.onCommitted.removeListener(this.requestOnTimeout)
    chrome.webNavigation.onCompleted.removeListener(this.requestOnComplete)
    chrome.webNavigation.onErrorOccurred.removeListener(this.skipFaultyPage)
  }

  async next() {

    // check if tab exists
    const next = this.runner.next()

    if (next.done) {
      console.info('<<< CRAWL END >>>')
      this.status = 'finished'
      this.detachEvents()
      chrome.tabs.remove(this.tabId, () => {
        console.info(`Closed tab ${this.tabId}`);
      });
    } else {
      this.cursor = next.value
      await this.open(this.cursor.url, false)
    }
  }

  open(url: string, resizewindow: boolean) {
    if (resizewindow) {
      resizeWindow()
    }
    return new Promise<void>((resolve, reject) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      }
      // console.info(`Moving... ${url}`)
      chrome.tabs.update(this.tabId, { url: url }, () => {
        // console.info(`Moved ${url}`)
        resolve()
      })
    })
  }

  skipFaultyPage = async (details: chrome.webNavigation.WebNavigationFramedErrorCallbackDetails) => {
    const frameId = details.frameId
    if (frameId !== 0) return;
    if (!(details.url.startsWith('http') || details.url.startsWith('https'))) return;

    console.warn("Error on ", details.tabId)
    console.warn("by", details.error)
    const ignorableErrorList = ['net::ERR_ABORTED']
    if (!ignorableErrorList.includes(details.error)) {
      if (this.loadTimeoutId) clearTimeout(this.loadTimeoutId);
      await this.next()
    }
  }

  requestOnTimeout = async (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
    const frameId = details.frameId
    if (frameId !== 0) return;
    if (!(details.url.startsWith('http') || details.url.startsWith('https'))) return;

    this.loadTimeoutId = setTimeout(async () => {
      this.loadTimedOut = true
      console.warn("CRAWL: Something wrong but try anyway")
      await this.crawl()
    }, this.config.timeoutAfterOpen)
  }

  requestOnComplete = async (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
    const frameId = details.frameId
    if (frameId !== 0) return;
    if (!(details.url.startsWith('http') || details.url.startsWith('https'))) return;

    console.debug("CRAWL: LOAD EVENT fired. waiting...", this.loadTimeoutId, details)
    if (this.loadTimeoutId) clearTimeout(this.loadTimeoutId);
    setTimeout(async () => {
      console.debug("CRAWL!")
      await this.crawl()
    }, this.config.timeoutAfterLoad)
  }

  crawl = async () => {
    console.debug("CRAWL: Crawling...", this.tabId, this.cursor.url)
    try {
      const response = typeof this.requestCallback === 'function' ?
        await this.requestCallback(this.tabId, this.cursor.id) :
        await requestContentScript(this.tabId, {
          taskName: TASK_NAME_CRAWL,
          id: this.cursor.id,
          ...this.requestCallback
        })

      if (this.responseCallback) await this.responseCallback(this, response)
      if (this.config.auto) await this.next()
    }
    catch (err) {
      console.error("Crawl Failed", err)
      console.log("---- ABRUBTLY STOPPED CRAWL -----")
      this.detachEvents();
      // if (this.config.auto) await this.next()
    }
  }

}

