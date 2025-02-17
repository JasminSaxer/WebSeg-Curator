import { LocalConfig } from "../../common"
import { CurationConfig } from "../../common/configs/curation";
import { Page } from "../../types";
import { Task, TaskManager } from "../../types/task";
import { addCuratedSegments, addSimilarSegments, getAllBoundingBoxes, checkForCurated } from ".";
import { DELETE_Form } from "../../common/api";

export class Curation extends Task {
  constructor(
    public tabId: number,
    public pages: Page[],
    public config: CurationConfig,
    public requestCallback?: {},
    public responseCallback?: (task: any, message: any, sendResponse?: (response: any) => void) => Promise<void>
  ) {
    super(tabId, pages, config, undefined, responseCallback)
    chrome.contextMenus.create({
      id: `CurationPrev-${tabId}`,
      title: `Prev ${tabId}`,
      parentId: 'CurationControl',
      onclick: this.prev
    })
    chrome.contextMenus.create({
      id: `CurationNext-${tabId}`,
      title: `Next ${tabId}`,
      parentId: 'CurationControl',
      onclick: this.next
    })
  }
  start() {
    this.attachEvents()
    this.load(true)
  }

  async load(start = false) {
    const id = this.currentPage.id
    chrome.tabs.update(this.tabId, { url: `${LocalConfig.getInstance().mhtmlApi}/${id}.mhtml` })
    
    console.debug('Config', this.config)

    // check if option startLastCurated is true, skip to next if page already curated
    if (this.config.startLastCurated && start) {
      const already_curated = await checkForCurated(this.tabId, id)
      if (already_curated) {
        console.info('Already curated (min 3 Segments), skipping')
        this.next(false, true)
      }
      else {
        this.prev()
        await addSimilarSegments(this.tabId, id)
        await sleep(500);
        await addCuratedSegments(this.tabId, id, this.config.showAllUsers);}
    }

    // Just get Boundingboxes for all with curation if chosen auto
    else if (this.config.auto){
          this.next(true)
    }
    // Add similar segments and curated segments, to continue segmentation labeling
    else {
      await addSimilarSegments(this.tabId, id)
      await sleep(500);
      await addCuratedSegments(this.tabId, id, this.config.showAllUsers);}

  } 

  prev() {
    const prev = this.pageGenerator.next('prev')
    if (!prev.done) {
      this.currentPage = prev.value
      this.load()
    }
  }

  async next(getBoundingBoxes = true, start = false) {
    await chrome.tabs.update(this.tabId, { url: `${LocalConfig.getInstance().mhtmlApi}/${this.currentPage.id}.mhtml` })
    
    if (this.config.addBoundingBoxes){
      // check for getboundingboxes
      if (getBoundingBoxes) {
        await sleep(1000);
        await getAllBoundingBoxes(this.tabId, this.currentPage.id);
        await sleep(1000);
      }}

    console.log('>>> Curation NEXT >>>')
    const next = this.pageGenerator.next()
    if (next.done) {
      console.log('<<< Curation END >>>')
      this.status = 'finished'
      this.detachEvents()
      console.log(this.tabId)
      TaskManager.getInstance().destroy(this.tabId)
    } else {
      this.currentPage = next.value
      this.load(start)
    }
  }

  arrowBrowse(command: string) {
    if (command === 'next_action') this.next()
    if (command === 'prev_action') this.prev()
  }

  attachEvents() {
    chrome.runtime.onMessage.addListener(Curation.curate)
    chrome.runtime.onMessage.addListener(Curation.removeLabel)
    chrome.commands.onCommand.addListener(this.arrowBrowse)
    chrome.runtime.onMessage.addListener(Curation.keyBrowse)

  }
  checkEvents() {

  }
  detachEvents() {
    chrome.contextMenus.remove(`CurationPrev-${this.tabId}`)
    chrome.contextMenus.remove(`CurationNext-${this.tabId}`)
    chrome.runtime.onMessage.removeListener(Curation.curate)
    chrome.runtime.onMessage.removeListener(Curation.removeLabel)
    chrome.runtime.onMessage.removeListener(Curation.keyBrowse)
    chrome.commands.onCommand.removeListener(this.arrowBrowse)
  }


  static getTask(tabId: number) {
    const { task, taskType } = TaskManager.getInstance().getTaskByTabId<Curation>(tabId)
    if (taskType === Curation.getClassName()) return task;
    return false
  }
  static curate(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    const tabId = sender.tab ? sender.tab.id : chrome.tabs.TAB_ID_NONE
    if (tabId === chrome.tabs.TAB_ID_NONE || tabId === undefined) {
      console.warn("Unknown message", sender)
      return false
    }
    const { work, action } = message
    const task = Curation.getTask(tabId)
    if (task && work === 'curation') {
      console.debug("[Curation] Message from tab", tabId, message)
      if (typeof task.responseCallback === 'function') {
        task.responseCallback(task, message, sendResponse)
        return true
      }
    }
  }

  static removeLabel(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    if (message.type === 'LABEL_REMOVED') {
      const { huy, label, pid, t } = message;
      const params = {
        tagType: message.label,
        hyuIndex: message.hyuValue,
        userId: message.userId,
        pid: message.pid,
      };
      console.debug('delete Form', params);
      const localConfig = LocalConfig.getInstance();
      DELETE_Form(localConfig.host, `curation/page/${pid}`, params)
    }
  }

  static async keyBrowse(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    if (sender.tab && sender.tab.id) {
      const task = Curation.getTask(sender.tab.id)
      if (task) {
        const { action, work } = message
        if (action === 'next') task.next()
        if (action === 'prev') task.prev()
      }
    }
  }

}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}