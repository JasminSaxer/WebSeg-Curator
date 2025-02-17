import { LocalConfig } from '../../common'
import { getCurationConfig } from '../../common/configs/curation'
import { getSync } from '../../common/storage'
import { Page } from '../../types'
import { TaskManager } from '../../types/task'
import { GET, POST_Form, sleep } from '../utils'
import { Curation } from './curation'

export async function createCurationTask(sourceName: string) {
  console.log("START Curation", sourceName)
  const host = await getSync('host')
  const target = await GET(host, `curation/source/${sourceName}`) as {
    size: number,
    pages: Page[]
  }
  // console.log("Curation Size", target.size)
  const manager = TaskManager.getInstance()

  const config = await getCurationConfig()
  // Curation has no request callback
  const requestCallback = {}
  const responseCallback = async (task: Curation, response: any, sendResponse: any) => {
    // console.log('Tabid', task.tabId)
    tag(response, task.currentPage.id, task.tabId).then(() => {
      sendResponse('OK!')
    })
    return true
  }
  const task = await manager.create<Curation>(target.pages, Curation, config, requestCallback, responseCallback)
  task.start()
}

chrome.contextMenus.create({
  id: 'CurationControl',
  title: 'Inspect pages - Control',
})

//EXAMPLE START
export async function addCuratedSegments(tabid: any, pageId: any, showAllUsers: boolean) {
  console.debug('add Curated Segments')
  // add all segments from api
  const { answers } = await GET(LocalConfig.getInstance().host, `evaluation/answer/${pageId}`)
  const localConfig = LocalConfig.getInstance()

  console.debug('showAllUsers', showAllUsers)
  if (showAllUsers) {
    const userIds = [...new Set(answers.map((answer: any) => answer.userId))];
    const userIdColorMap: { [userId: string]: string } = {};

    userIds.forEach((userId: any) => {
      userIdColorMap[userId] = generateRandomColor();
    });

    answers.forEach((answer: any) => {
      const userId = answer.userId;
      const userColor = userIdColorMap[userId];
      addBackgroundColorToElement(answer.hyuIndex, tabid, answer.tagType, pageId, userId, localConfig, userColor);
    });

  }
  else{
    const userId = await getUserId()
    const filteredAnswers = answers.filter((answer: any) => answer.userId === userId);
    filteredAnswers.forEach((answer: any) => {
      addBackgroundColorToElement(answer.hyuIndex, tabid, answer.tagType, pageId, userId, localConfig);
    });
  }
}

function generateRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  
  // Convert hex color to RGB
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  // Return RGBA color with 30% transparency
  return `rgba(${r}, ${g}, ${b}, 0.3)`;
}

export async function checkForCurated(tabid: any, pageId: any) {
  const { answers } = await GET(LocalConfig.getInstance().host, `evaluation/answer/${pageId}`)
  const userId = await getUserId()
  const filteredAnswers = answers.filter((answer: any) => answer.userId === userId);
  // if length answers > 1 then curated return true
  return filteredAnswers.length > 3
}

async function tag(response: any, pid: string, tabId: number) {
  const localConfig = LocalConfig.getInstance()
  const { name, hyu } = response.data
  try {
    const userId = await getUserId()

    const tab = await getTab(tabId);
    // const boundingBox = await getBoundingBox(hyu, tab)
    const nodeInfo = await getNodeInfo(hyu, tab)
    console.debug('Bounding Box', nodeInfo)

    // add backgound color to element
    addBackgroundColorToElement(hyu, tabId, name, pid, userId, localConfig)

    const params = {
      tagType: name,
      hyuIndex: hyu,
      userId: userId,
      nodeInfo: JSON.stringify(nodeInfo),
      // screenshot_element: screenshot_element,
      boundingBox: '' //JSON.stringify(boundingBox)
    }
    // console.debug('Tagging Params:', params)
    const reqUrl = await POST_Form(localConfig.host, `curation/page/${pid}`, params)
    // console.log("Uploaded", reqUrl)
  }
  catch (err) {
    console.error('tagging failed', err)
  }
}


async function getBoundingBox(hyu: any, tab: any) {
  const boundingBox = await getPosition(hyu, tab.id)
  boundingBox.totalPageHeight = await getTotalPageHeight(tab.id)
  return boundingBox
}
async function getNodeInfo(hyu: any, tab: any) {
  const nodeInfo = await execute_getnodeinfo(hyu, tab.id)
  return nodeInfo
}

async function execute_getnodeinfo(hyuValue: any, tabId: number) {
  const position: any = await new Promise((resolve, reject) => {
    chrome.tabs.executeScript(
      tabId,
      { code: `(${getnodeinfo_function.toString()})('${hyuValue}')` },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else if (!results || !results.length || results[0].error) {
          reject(results && results[0] && results[0].error ? results[0].error : 'Failed to retrieve element position');
        } else {
          resolve(results[0]);
        }
      }
    );
  });
  return position
}


function getnodeinfo_function(hyuValue: any) {
  console.debug('Searching for element with hyu:', hyuValue); // Add logging
  const element = document.querySelector(`[hyu="${hyuValue}"]`);
  if (!element) {
    console.error(`Element with hyu=${hyuValue} not found`); // Add error logging
    return { error: `Element with hyu=${hyuValue} not found` };
  }
  // get content length if exist (less data to save but still information)
  let content_length = 0
  if (element.textContent){
    content_length = element.textContent.length}

  
  return {
    className: element.className,
    tagName: element.tagName,
    name: element.getAttribute('name'),
    content_length: content_length
  };
}


async function getPosition(hyuValue: any, tabId: number) {
  const position: any = await new Promise((resolve, reject) => {
    chrome.tabs.executeScript(
      tabId,
      { code: `(${getElementPosition.toString()})('${hyuValue}')` },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else if (!results || !results.length || results[0].error) {
          reject(results && results[0] && results[0].error ? results[0].error : 'Failed to retrieve element position');
        } else {
          resolve(results[0]);
        }
      }
    );
  });
  return position
}

async function addBackgroundColorToElement(hyuValue: any, tabId: number, label: string, pid: string, userId: string, localConfig: any, usercolor: string = 'none') {
  console.debug('AddBackgroundcolor to element', hyuValue)
  const result: any = await new Promise((resolve, reject) => {
    chrome.tabs.executeScript(
      tabId,
      { code: `(${addBackgroundColor.toString()})('${hyuValue}', '${label}', '${pid}', '${userId}', '${localConfig.host}', '${usercolor}')` },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else if (!results || !results.length || results[0].error) {
          reject(results && results[0] && results[0].error ? results[0].error : 'Failed to add background color');
        } else {
          resolve(results[0]);
        }
      }
    );
  });
  return result;
}

async function getTab(tabId: number) {
  return await new Promise<any>((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        resolve(tab)
      }
    })
  })
}


function getElementPosition(hyuValue: any) {
  console.debug('Searching for element with hyu:', hyuValue); // Add logging
  const element = document.querySelector(`[hyu="${hyuValue}"]`);
  if (!element) {
    console.error(`Element with hyu=${hyuValue} not found`); // Add error logging
    return { error: `Element with hyu=${hyuValue} not found` };
  }
  const rect = element.getBoundingClientRect();
  console.debug('Element found. Position:', rect); // Log element position

  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height  };
}

async function addBackgroundColor(hyuValue: string, label: string, pid: string, userId: string, localConfig: any, user_color: string) {
  // Background colors

  let blue = 'rgba(0, 125, 255, 0.3)';
  let orange = 'rgba(255, 125, 0, 0.3)';
  let purple = 'rgba(93, 0, 255, 0.3)';

  if (user_color != 'none') {
    blue = user_color;
    orange = user_color;
    purple = user_color;
  }

  // console.debug('localconfig inside addBackgroundcollor', localConfig)
  const style = document.createElement('style');
  style.textContent = `
    .label_segmentation {
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
      top: 0;
      right: 0;
      background-color: rgba(0, 0, 255, 1); /* Background color for the text */
      color: white; /* Text color */
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 18px;
      font-weight: bold; 
      z-index: 10000; /* Ensure labels are above the background color */
      display: inline-block;
    }

    .close-button {
      margin-left: 5px;
      cursor: pointer;
      color: red;
      font-size: 20px; /* Smaller font size for the close button */
      font-weight: bold; 
      line-height: 15px; /* Adjust line height */
      display: inline-block;
      width: 15px; /* Fixed width */
      height: 15px; /* Fixed height */
      text-align: center; /* Center the text */
    }
  `;
  if (!document.querySelector('style')) {
    document.head.appendChild(style);
  }
  console.debug('Searching for element with hyu:', hyuValue);
  const element = document.querySelector(`[hyu="${hyuValue}"]`);

  if (element) {
    // element.style.position = 'relative'; // Ensure the parent element is positioned relative

    // Check if there are existing labels
    const existingLabels = Array.from(element.querySelectorAll('.label_segmentation')).filter(label => label.parentElement === element);
    console.debug('existing labels', existingLabels, 'length', existingLabels.length);
    if (existingLabels.length > 0) {
      // Create a new label element
      const newLabelElement = document.createElement('div');
      newLabelElement.classList.add('label_segmentation');
      newLabelElement.textContent = label;

      // Create a close button
      const closeButton = document.createElement('span');
      closeButton.classList.add('close-button');
      closeButton.textContent = 'X';
      closeButton.onclick = () => {
        // Remove the label from the DOM
        newLabelElement.remove();

        // Send a message to the background script
        chrome.runtime.sendMessage({
          type: 'LABEL_REMOVED',
          hyuValue,
          label,
          pid,
          userId
        });

        // Adjust the positions of the remaining labels
        adjustLabelPositions(element);
        // Remove background color if no labels are left
        if (element.querySelectorAll('.label_segmentation').length === 0) {
          element.style.backgroundColor = '';
          element.style.border = '';
          // element.style.position = '';
        } else {
          adjustBackgroundColor(element);
        }
      };

      // Append the close button to the label
      newLabelElement.appendChild(closeButton);

      // Calculate the cumulative height of all existing labels
      let cumulativeHeight = 5; // Start with 5px for the initial top offset
      existingLabels.forEach(label => {
        cumulativeHeight += label.getBoundingClientRect().height + 5; // Adding 5px for spacing
      });

      // Position the new label just underneath the cumulative height of existing labels
      newLabelElement.style.top = `${cumulativeHeight}px`;
      newLabelElement.style.right = '5px';

      // Append the new label element to the element
      element.appendChild(newLabelElement);

      adjustBackgroundColor(element);
    } else {
      // Create a new label element
      const labelElement = document.createElement('div');
      labelElement.classList.add('label_segmentation');
      labelElement.textContent = label;

      // Create a close button
      const closeButton = document.createElement('span');
      closeButton.classList.add('close-button');
      closeButton.textContent = 'x';
      closeButton.onclick = () => {
        // Remove the label from the DOM
        labelElement.remove();

        // Send a message to the background script
        chrome.runtime.sendMessage({
          type: 'LABEL_REMOVED',
          hyuValue,
          label,
          pid,
          userId
        });

        // Adjust the positions of the remaining labels
        adjustLabelPositions(element);

        if (element.querySelectorAll('.label_segmentation').length === 0) {
          element.style.backgroundColor = '';
          element.style.border = '';
          // element.style.position = '';
        } else {
          adjustBackgroundColor(element);
        }
      };

      // Append the close button to the label
      labelElement.appendChild(closeButton);

      // Append the new label element to the element
      element.appendChild(labelElement);

      adjustBackgroundColor(element)
    }

    return { success: true };
  } else {
    return { error: 'Element not found' };
  }


  function adjustBackgroundColor(element: Element) {
    console.debug('adjustBackgroundColor', element)
    const existingLabels = Array.from(element.querySelectorAll('.label_segmentation')).filter(label => label.parentElement === element);
    // Set the background color based on label content
    let hasDigilog = false;
    let hasNormal = false;

    existingLabels.forEach((label: Element) => {
      const labelText = label.textContent;

      if (/^\d/.test(labelText)) {
        hasDigilog = true;
      } else {
        hasNormal = true;
      }
    });

    let color = ''
    if (hasDigilog && hasNormal) {
      color = purple;
    } else if (hasDigilog) {
      color = blue;
    } else if (hasNormal) {
      color = orange;
    }

    element.style.setProperty('background-color', color, 'important');

    const color_solid = ensureRgbaAlphaOne(color)
    element.style.border = `2px solid ${color_solid}`;

    // make transparency of all children nodes to 0.5
    // const children = element.children;
    // for (let i = 0; i < children.length; i++) {
    //   (children[i] as HTMLElement).style.backgroundColor = color;
    // }
  }

  async function adjustLabelPositions(element: Element) {
    const labels = element.querySelectorAll('.label_segmentation');
    let cumulativeHeight = 5; // Start with 5px for the initial top offset
    labels.forEach(label => {
      (label as HTMLElement).style.top = `${cumulativeHeight}px`;
      cumulativeHeight += label.getBoundingClientRect().height + 5; // Adding 5px for spacing
    })
  }
  function ensureRgbaAlphaOne(color: string): string {
    return color.replace(/rgba?\(([^)]+)\)/, (match, colorValues) => {
      const [r, g, b] = colorValues.split(',').map(Number);
      return `rgba(${r}, ${g}, ${b}, 1)`;
    });
  }
}



// Function to capture the width of the screenshot
async function captureScreenshotWidth(tabid: number): Promise<{ width: number, height: number }> {
  return new Promise<{ width: number, height: number }>((resolve, reject) => {
    // Capture the visible area of the tab as an image
    chrome.tabs.captureVisibleTab(tabid, { format: 'png' }, async (dataUrl: string) => {
      if (chrome.runtime.lastError) {
        console.warn("[WARN] Cannot Capture Screenshot", chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError.message);
        return;
      }
      // Convert the data URL to an Image element
      const img = new Image();
      img.src = dataUrl;

      img.onload = () => {
        resolve({ width: img.width, height: img.height }); // Resolve with the width and height of the image
      };

      img.onerror = (err) => {
        reject(new Error('Failed to load image'));
      };
    });
  });
};


export async function getTotalPageHeight(tabId: number) {
  return new Promise<number>((resolve, reject) => {
    chrome.tabs.executeScript(tabId,
      {
        code: `
          (Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
        `,
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else {
          if (results && results[0]) {
            const totalPageHeight = results[0];
            resolve(totalPageHeight);
          } else {
            console.debug('Results empty? for totalPageHeight:', results)
            resolve(0);
          }
        }

      });
  });
}



export async function addSimilarSegments(tabId: any, this_pageid: any) {
  console.debug('Adding Similar Segments')
  // filter for the same user id
  const userId = await getUserId()
  console.debug('userId', userId)

  if (!userId) {
    alert("UserId is not set. Please set a UserId.");
    chrome.tabs.remove(tabId);
    return;
  }

  // Check if the page has any segments
  const { answers, page } = await GET(LocalConfig.getInstance().host, `evaluation/answer/${this_pageid}`)
  const answersUser = answers.filter((answer: any) => answer.userId === userId);
  console.debug('answers from user', answersUser)

  if (answersUser.length === 0) {
    // get answers from same domain
    const { answers } = await GET(LocalConfig.getInstance().host, `curation/answer/${this_pageid}`)
    const answers_domain = answers

    if (answers_domain.length === 0) {
      console.debug('No Similar Segments found.')
      return
    }
    console.debug(answers_domain.length, ' answers from same domain found.')
    //filter Answers
    console.debug('filter Answers')
    const filteredAnswers = answers_domain.filter((answer: any) => answer.userId === userId);

    const commonAnswers = filteredAnswers.filter((answer: any) => {
      const { tagType } = answer;
      return tagType === 'header' || tagType === 'nav' || tagType === 'footer' || tagType === 'advertisement';
    });

    const digilogAnswers = filteredAnswers.filter((answer: any) => /^\d/.test(answer.tagType));

    console.debug('commonAnswers', commonAnswers)
    // find node of common Answer and add to curation
    const tab = await getTab(tabId);
    const localConfig = LocalConfig.getInstance()

    // go through each answer of the common page and check if found in this page
    for (const answer of commonAnswers) {
      console.debug('answer', answer)

      const {tagType, hyuIndex, nodeInfo } = answer;
      const hyuValue_answer = hyuIndex;

      // dont check content length for nav and adv, because changes, others shouldn't change
      
      let check_content_length = true;
      if (tagType === 'nav' || tagType === 'advertisement') {
        check_content_length = false;
      }
      console.debug('TagType:', tagType, check_content_length) 
      const element_string = await getElementbyClassnameinTab(nodeInfo, tabId, check_content_length);

      if (element_string === 'none') {
        console.debug('no unique Element string found for nodeInfo:', nodeInfo);
        continue;
      }

      const reconstructedElement = document.createElement('div');
      reconstructedElement.innerHTML = element_string;
      const element = reconstructedElement.firstChild;

      console.debug('element', element)
      if (element) {
        console.debug('add common Segments', tagType, hyuValue_answer);

        await postFormForElement(element, tab, tagType, userId, localConfig, this_pageid, nodeInfo)

        // check if any children of the common answer element are a digilog answer (check if in the common answer smaller digilog answer labeled)
        console.debug('Checking for children in element')
        // only in header and footer
        if (tagType === 'header' || tagType === 'footer') {
          for (const digilogAnswer of digilogAnswers) { // Check all digilogAnswers of the page
            console.debug('digilogAnswer', digilogAnswer)
            const {tagType, hyuIndex, nodeInfo } = digilogAnswer;
            // Find the child element through the common things: tagname, class, content length
            const child_element_string = getElementbyInfo_inString(nodeInfo, element);

            
            if (child_element_string !== 'none') {
              const reconstructedchildElement = document.createElement('div');
              reconstructedchildElement.innerHTML = child_element_string;
              const child_element = reconstructedchildElement.firstChild;
              console.debug('child_element', child_element)
              // make the child element a HTMLElement
              console.debug('add digilog Segments (Which are children of common Segment)', digilogAnswer.tagType, digilogAnswer.hyuIndex);
              await postFormForElement(child_element, tab, digilogAnswer.tagType, userId, localConfig, this_pageid, nodeInfo)
              }
            
          }
        }
      }
    }
  }
  else {
    console.debug('User has already segments on this page. Skipping...')
  }
}



async function postFormForElement(element: any, tab: any, tagType: any, userId: any, localConfig: any, this_pageid: any, nodeInfo:any) {
  const hyuValue_new = element.getAttribute('hyu');
  console.debug('new hyuValue', hyuValue_new);
  console.debug('add new Element', tagType, hyuValue_new);
  if (hyuValue_new) {
    postForm(tagType, hyuValue_new, userId, '', localConfig, this_pageid, nodeInfo);
  }

  return { hyuValue_new: hyuValue_new };
}

function postForm(tagType: any, hyuValue: any, userId: any, boundingBox: any, localConfig: { host: string }, pageid: any, nodeInfo:any) {
  const params = {
    tagType: tagType,
    hyuIndex: hyuValue,
    userId: userId,
    boundingBox: '', 
    nodeInfo: nodeInfo
  }
  const reqUrl = POST_Form(localConfig.host, `curation/page/${pageid}`, params)
}


async function getElementbyClassnameinTab(nodeInfo: any, tabId: number, check_content_length: boolean) {
  console.debug('Get Element by Classname in Tab  ', nodeInfo, check_content_length)
  const result: any = await new Promise((resolve, reject) => {
    chrome.tabs.executeScript(
      tabId,
      { code: `(${getElementbyClassname.toString()})('${nodeInfo}', '${check_content_length}')` },

      (results) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError.message);
        } else if (!results || !results.length || results[0].error) {
          console.error('Failed to get element by class name:', results);
          reject(results && results[0] && results[0].error ? results[0].error : 'Failed to get element by class name');
        } else {
          resolve(results[0]);
        }
      }
    );
  });
  return result;
}

function getElementbyClassname(nodeInfo_string: any, check_content_length_string: string) {
  // wihtout using content length!!
  console.debug('nodeinfo string', nodeInfo_string)
  const nodeInfo = JSON.parse(nodeInfo_string);
  const check_content_length = JSON.parse(check_content_length_string);

  console.debug('nodeinfo', nodeInfo)
  let query = `${nodeInfo.tagName}`

  if (nodeInfo.className){
    query += `[class="${nodeInfo.className}"]`
  }
  if (nodeInfo.name){
    query += `[name="${nodeInfo.name}"]`
  }
  console.debug('query', query)
  const elements = document.querySelectorAll(query)
  console.debug('elements', elements)
  // check if text content is the same length
  // for each ele in elements

  if (check_content_length) {
    console.debug('check content length')
    const matchingElements = Array.from(elements).filter(element => {
      return element.textContent && element.textContent.length === nodeInfo.content_length;
    });

    console.debug('matchingElements', matchingElements)
    console.debug('number of matchingElements', matchingElements.length)
  
    if (matchingElements.length === 1) {
      console.debug('matchingElement', matchingElements[0])
      return matchingElements[0].outerHTML;
    }
    else{
      console.debug('no unique Element found')
      return 'none';
    }
  }
  else{
    console.debug('matchingElements', elements)
    console.debug('number of matchingElements', elements.length)
    
    if (elements.length === 1) {
      console.debug('matchingElement', elements[0])
      return elements[0].outerHTML;
    }
    else{
      console.debug('no unique Element found')
      return 'none';
    }
  }



}


function getElementbyInfo_inString(nodeInfo_string: any, element: any) {
  console.debug('nodeinfo string', nodeInfo_string)
  const nodeInfo = JSON.parse(nodeInfo_string);

  console.debug('nodeinfo', nodeInfo)
  let query = `${nodeInfo.tagName}`

  if (nodeInfo.className){
    query += `[class="${nodeInfo.className}"]`
  }
  if (nodeInfo.name){
    query += `[name="${nodeInfo.name}"]`
  }
  console.debug('query', query)
  const elements =  (element as HTMLElement).querySelectorAll(query)

  console.debug('elements', elements)
  // check if text content is the same length
  // for each ele in elements

  // 
  const matchingElements = Array.from(elements).filter(element => {
    return element.textContent && element.textContent.length === nodeInfo.content_length;
  });
  console.debug('matchingElements', matchingElements)

  if (matchingElements.length === 1) {
    console.debug('matchingElement', matchingElements.length)
    console.debug('matchingElement', matchingElements[0])
    return matchingElements[0].outerHTML;
  }
  else{
    console.debug('no unique Element found')
    return 'none';
  }
}


export async function getAllBoundingBoxes(tabId: any, pageId: any) {
  console.debug('Get All Bounding Boxes')

  // get all segments
  const { answers } = await GET(LocalConfig.getInstance().host, `evaluation/answer/${pageId}`);
  const userId = await getUserId();
  const filteredAnswers = answers.filter((answer: any) => answer.userId === userId);
  // Check if any boundingboxes are === ''
  const emptyBoundingBoxes = filteredAnswers.filter((answer: any) => answer.boundingBox === '');
  // if none are empty return
  if (emptyBoundingBoxes.length === 0) {
    console.debug('All Bounding Boxes already saved')
    return
  }

  // get current page size and change to screenshot size (2619)
  const { curr_width, curr_height, curr_left, curr_top } = await resizeWindow(true, 2575, 1527);
  // console.debug('Changed window size ( before: ', curr_width, curr_height, curr_left, curr_top)
  await sleep(1000);
  let currwindowsize = await getcurrentwindowsize()
  console.debug('Current Window Size', currwindowsize)

  const size_width = 2619 // should be 2560 pixel innerwidht..
  const size_height = 1483 // innersize should be then 1440

  console.debug('Set Window Size to', size_width, size_height)
  let set_width = size_width - (currwindowsize.width - size_width)
  let set_height = size_height - (currwindowsize.height - size_height)

  while (currwindowsize.width != size_width && currwindowsize.height != size_height) {
    await resizeWindow(false, set_width, set_height);
    // console.debug('Changed window size ( before: ', curr_width, curr_height, curr_left, curr_top)
    await sleep(1000);
    currwindowsize = await getcurrentwindowsize()
    console.debug('Current Window Size', currwindowsize)
    set_width = size_width - (currwindowsize.width - set_width)
    set_height = size_height - (currwindowsize.height - set_height)
  }

  await sleep(1000);
  currwindowsize = await getcurrentwindowsize()

  // Scroll to the bottom of the page
  await scrollDown(tabId);

  console.debug('Current Window Size set to: ', set_width, set_height)
  console.debug('Current Window Size final', currwindowsize)

  const localConfig = LocalConfig.getInstance()
  const tab = await getTab(tabId)
  const { width, height } = await captureScreenshotWidth(tab.windowId)
  console.debug('Screenshot width', width, 'height', height)

  // get all bounding boxes and save in mongodb
  await filteredAnswers.forEach(async (answer: any) => {
    const { hyuIndex, id, boundingBox } = answer;
    // if Bounding Box is not already saved
    if (boundingBox === '') {
      // Bounding box is empty
      const boundingBox = await getBoundingBox(hyuIndex, tab);
      boundingBox.windowHeight = height;

      console.debug('Boudning Box x', boundingBox.x, 'hyu', hyuIndex)
      const params = { boundingBox: JSON.stringify(boundingBox) }

      await POST_Form(localConfig.host, `curation/answer/${id}`, params)
    }
    else {
      console.debug('BoundingBox already saved', '"' + boundingBox + '"')
    }
  });

  await sleep(500);
  // change page size back to original
  await resizeWindow(false, curr_width, curr_height, curr_left, curr_top);
}
async function scrollDown(tabId: any) {
  await new Promise<void>((resolve, reject) => {
    chrome.tabs.executeScript(tabId, {
      code: `
        window.scrollTo(0, document.body.scrollHeight);
        resolve();
      `
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message)
        reject(chrome.runtime.lastError)
      } else {
        resolve()
      }
    })
  })
}

async function getUserId() {
  return await new Promise<string>((resolve, reject) => {
    chrome.storage.sync.get('userId', items => {
      let userId = items.userId;
      if (userId === null || userId === '') {
        console.error("UserId NOT SET");
        userId = window.prompt("Enter a UserID");
        if (userId === undefined || userId === '') {
          reject('No UserId');
        } else {
          // update the userid
          chrome.storage.sync.set({ userId: userId }, () => {
            console.debug('UserId set to', userId);
            resolve(userId); // Resolve after setting the userId
          });
        }
      } else {
        resolve(userId); // Resolve if userId is already set
      }
      // console.debug('Get UserId', "'"+userId+"'")
    });
  });
}

export async function resizeWindow(maximize = true, width = 2575, height = 1527, left = 0, top = 0): Promise<{ curr_width: number, curr_height: number, curr_left: number, curr_top: number }> {
  console.debug('Resize Window', width, height)
  return new Promise<{ curr_width: any, curr_height: any, curr_left: any, curr_top: any }>((resolve, reject) => {
    chrome.windows.getCurrent({}, (currentWindow) => {
      if (currentWindow.id !== undefined) {

        //  get pixelratio
        const pixelratio = window.devicePixelRatio

        // if pixel ration is not 1 add WARNING message in pop up and close window
        if (pixelratio != 1) {
            alert(`WARNING: Pixel Ratio is not 1 (Current Pixel Ratio: ${pixelratio})\nSet the Display Scale to 100% Or Zoom to 100%!`)
          chrome.windows.remove(currentWindow.id)
        }

        const curr_width = currentWindow.width;
        const curr_height = currentWindow.height;
        const curr_left = currentWindow.left;
        const curr_top = currentWindow.top;

        if (maximize) {
          // Maximize the window first
          chrome.windows.update(currentWindow.id, { state: 'maximized' }, () => {
            // Wait for a short duration to ensure the window is maximized
            setTimeout(() => {
              // Then resize the window to the new dimensions
              chrome.windows.update(currentWindow.id, {
                width: width,
                height: height,
                left: curr_left,
                top: curr_top,
                state: 'normal' // Ensure the window is in normal state after resizing
              }, () => {
                resolve({ curr_width, curr_height, curr_left, curr_top });
              });
            }, 500); // Adjust the delay as needed
          });
        } else {
          chrome.windows.update(currentWindow.id, {
            width: width,
            height: height,
            left: left,
            top: top,
            state: 'normal'
          }, () => {
            resolve({ curr_width, curr_height, curr_left, curr_top });
          });
        }
      } else {
        reject(new Error('Failed to get current window ID'));
      }
    });
  });
}

async function getcurrentwindowsize() {
  return new Promise<{ width: any, height: any, left: any, top: any }>((resolve) => {
    chrome.windows.getCurrent({}, (currentWindow) => {
      if (currentWindow.id !== undefined) {
        const width = currentWindow.width;
        const height = currentWindow.height;
        const left = currentWindow.left;
        const top = currentWindow.top;

        resolve({ width, height, left, top });
      }
    });
  });
}


export async function updateMHTMLWithContentID(mhtmlContent: string) {
  const boundary = "------MultipartBoundary";
  const contentIDMap = {};
  const imageRegex = new RegExp(
      `${boundary}\\s*Content-Type:\\s*image\\/[^\\s]+\\s*Content-Transfer-Encoding:\\s*base64\\s*Content-Location:\\s*(.+?)\\s*Content-ID:\\s*<([^>]+)>\\s*\\n\\n([\\s\\S]+?)${boundary}`,
      'g'
  );

  // Step 1: Find all images and create a map of their Content-IDs and base64 data
  let match;
  while ((match = imageRegex.exec(mhtmlContent)) !== null) {
      const imageUrl = match[1].trim(); // Content-Location
      const contentID = match[2].trim(); // Content-ID
      const base64Data = match[3].trim(); // Base64 data

      // Store the mapping of image URL to Content-ID
      contentIDMap[imageUrl] = contentID;

      // You can optionally modify the base64 data here if needed.
  }

  // Step 2: Update the HTML part to use cid: references
  const htmlRegex = new RegExp(
      `${boundary}\\s*Content-Type:\\s*text\\/html; charset=UTF-8\\s*Content-Transfer-Encoding:\\s*7bit\\s*\\n\\n([\\s\\S]+?)${boundary}`,
      'g'
  );

  // Replace the HTML content with updated <img> tags
  mhtmlContent = mhtmlContent.replace(htmlRegex, (match, htmlContent) => {
      let updatedHtmlContent = htmlContent;

      // Replace src URLs with cid references
      Object.keys(contentIDMap).forEach((imageUrl) => {
          const cidReference = `cid:${contentIDMap[imageUrl]}`;
          const regex = new RegExp(`src=["']?${imageUrl}["']?`, 'g');
          updatedHtmlContent = updatedHtmlContent.replace(regex, `src="${cidReference}"`);
      });

      return match.replace(htmlContent, updatedHtmlContent);
  });

  return mhtmlContent; // Return the updated MHTML content
}
