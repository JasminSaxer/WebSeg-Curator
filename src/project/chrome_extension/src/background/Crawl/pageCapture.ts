import { update } from "lodash"

export async function pageCapture(tabId: number) {
  const mhtml = new Promise<Blob>((resolve, reject) => {
    chrome.pageCapture.saveAsMHTML({ tabId: tabId }, async (mhtmlData: Blob) => {
      if (chrome.runtime.lastError) {
        console.warn("[WARN] Cannot Crawled", chrome.runtime.lastError.message)
        reject(chrome.runtime.lastError.message)
      }
      resolve(mhtmlData)
    })
  })

  return mhtml
}


export async function pageCaptureAdaptMhtml(tabId: number) {
  const mhtml = new Promise<Blob>((resolve, reject) => {
      chrome.pageCapture.saveAsMHTML({ tabId: tabId }, async (mhtmlData: Blob) => {
          if (chrome.runtime.lastError) {
              console.warn("[WARN] Cannot Crawled", chrome.runtime.lastError.message);
              reject(chrome.runtime.lastError.message);
          }
          resolve(mhtmlData);
      });
  });
  console.debug('Got mhtml')
  try {
      // Get the MHTML data
      const blob = await mhtml;
      const reader = new FileReader();
      
      // Convert the Blob to text
      const mhtmlContent = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(blob);
      });
      // console.debug('MHTML Content:', mhtmlContent);
      // Process the MHTML content
      const updatedMHTMLContent = await updateMHTMLWithContentID(mhtmlContent);
      // console.debug('Updated MHTML Content:', updatedMHTMLContent);
      // Create a Blob from the updated MHTML content
      const updatedBlob = new Blob([updatedMHTMLContent], { type: 'multipart/related' });
    
      // console.debug('Return updated Mhtml', updatedBlob)
      return updatedBlob

  } catch (error) {
      console.error('Error processing MHTML:', error);
  }
}


export async function captureFullPageScreenshot(tab: chrome.tabs.Tab): Promise<Blob> {
  
  // Get the size of the viewport
  await resizeWindow(2560, 1440)
  await sleep(500);

  console.debug('Taking Screenshot...')


  let success = false;
  let width = 0;
  let height = 0;

  while (!success) {
    try {
      ({ width, height } = await captureScreenshotWidth(tab));
      success = true; // If captureScreenshotWidth succeeds, set success to true to exit the loop
    } catch (error) {
      console.error("Capture failed, retrying...", error);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
    }
  }
  const viewportWidth = width as number;
  const viewportHeight = height as number;

  // const totalPageHeight = await getTotalPageHeight(tab.windowId);
  // console.debug('Total Page Height:', totalPageHeight);

  // Set up a canvas to stitch together the screenshots
  const canvas = document.createElement('canvas');
  canvas.width = viewportWidth - 15;
  canvas.height = 1;

  const context = canvas.getContext('2d');
  let yOffset = 0;
  let headerheight = 0;

  // Function to capture a screenshot at a specific scroll position
  async function captureScreenshot(counter: number): Promise<void> {
    // console.debug('Begin scrollY', scrollY);
    return new Promise<void>((resolve, reject) => {

      // Scroll the tab to the specified position
      chrome.tabs.executeScript(tab.windowId, { code: `window.scrollTo(0, ${yOffset});` }, async () => {
        // Wait briefly for the scroll to settle before capturing the screenshot
        await sleep(500);

        // Get the current scroll position
        yOffset = await getCurrentScrollPosition()
        // console.debug('Y Offset after get:', yOffset);
        if (yOffset <= yOffset_after && counter == 1) {
          console.debug('yOffset:', yOffset, 'yOffset_last:', yOffset_after, 'counter:', counter);
          let userinput = prompt('Did it scroll to the end of the page? (y/n)');
          if (userinput == 'n') {
            return reject('Window did not scroll to the end of the page');
          }
        }

        //   if (userinput == 'y'){
        //     await sleep(5000)
        //     yOffset = await getCurrentScrollPosition()}
        // }
        // console.debug('yOffset:', yOffset, 'yOffset_last:', yOffset_last);
        // Capture the visible area of the tab as an image
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, async (dataUrl: string) => {
          if (chrome.runtime.lastError) {
            console.warn("[WARN] Cannot Capture Screenshot", chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError.message);
            return;
          }

          // Convert the data URL to a Blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();

          // Create an image element to draw onto the canvas
          const img = new Image();

          // Step 1: Create a temporary canvas
          const tempCanvas = document.createElement('canvas');
          const tempContext = tempCanvas.getContext('2d');

          // Step 2: Copy current canvas to temporary canvas
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;

          if (tempContext) {
            tempContext.drawImage(canvas, 0, 0);
          }
          img.onload = () => {
            if (context) {
              // Check if the yOffset is greater than the height of the canvas
              let imageheight = img.height;
              // console.debug('Image Height:', imageheight);

              // yOffset = canvas.height - img.height;
              if (canvas.height < imageheight) {
                canvas.height = imageheight;
              }
              else {
                canvas.height = yOffset + imageheight + first_headerheight;
              }

              context.drawImage(tempCanvas, 0, 0);
              context.drawImage(img, 0, yOffset + first_headerheight);

              // console.debug('canavas height:', canvas.height, 'yOffset:', yOffset);
              yOffset_after = yOffset
              yOffset += imageheight;
              // console.debug('yOffset: (after adding imageheight', yOffset);
              // console.debug('yOffset', yOffset, 'img.height', img.height);
              // Resolve once the image has been drawn
              resolve();
            } else {
              reject(new Error('Canvas context is null.'));
            }
          };
          img.src = dataUrl;
        });

        async function getCurrentScrollPosition() {
          await chrome.tabs.executeScript(tab.windowId, {
            code: `window.pageYOffset;`
          }, (results) => {
            // results[0] contains the current scroll position
            yOffset = results[0]
          })
          return yOffset;
        }
      });
    });
  }


  // Function to get the total height of the webpage
  async function getTotalPageHeight(tabId: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      // Wait a bit for the page to load dynamic content
      setTimeout(() => {
        chrome.tabs.executeScript(tabId, {
          code: `
            Math.max(
              document.body.scrollHeight, 
              document.documentElement.scrollHeight, 
              document.body.offsetHeight, 
              document.documentElement.offsetHeight, 
              document.body.clientHeight, 
              document.documentElement.clientHeight
            );
          `
        }, (result: any) => {
          if (chrome.runtime.lastError) {
            console.warn("[WARN] Cannot Get Total Page Height", chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError.message);
          } else if (result && result[0]) {
            const totalHeight = parseInt(result[0], 10);
            resolve(totalHeight);
          } else {
            reject("Failed to calculate page height.");
          }
        });
      }, 1000); // Adjust delay as necessary
    });
  }

  let yOffset_last = -1;
  let yOffset_after = -1;
  let counter = 0
  let first_headerheight = 0;

  while (yOffset != yOffset_last) {
    success = false;
    while (!success) {
      try {

        // console.debug('Counter:', counter);
        yOffset_last = yOffset;
        // console.debug('before while loop', yOffset, yOffset_last);
        await captureScreenshot(counter);
        // Hide the header after the first screenshot
        headerheight = await hideHeader(tab, yOffset, counter)
        if (counter == 0) {
          first_headerheight = headerheight;
        }
        yOffset -= headerheight;
        // console.debug('Y Offset after hideHeader:', yOffset, 'Header Height:', headerheight);
        // console.debug('after while loop', yOffset, yOffset_last);
        counter += 1;
        success = true; // If captureScreenshotWidth succeeds, set success to true to exit the loop
      } catch (error) {
        console.error("Capture failed, retrying...", error);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
      }
    }

  }


  // Convert the canvas to a Blob (PNG format)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob.'));
      }
    }, 'image/png');
  });
}

async function hideHeader(tab: chrome.tabs.Tab, yOffset: number, counter: number) {
  // console.debug('Hide Header');

  if (counter == 0) {
    return new Promise<number>((resolve, reject) => {
      chrome.tabs.executeScript(tab.windowId, {
        code: `
              let initialPageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
              let headerHeight = 0;
              let navHeight = 0;
              let divHeight = 0;
              let divTopbar = 0;
              const header = document.querySelector('header');
              if (header) {
                headerHeight = header.offsetHeight;
                header.style.display = 'none';
                header.style.boxShadow = 'none'; 
                if (header.id) {
                  const shadowElement = document.getElementById(header.id + 'Shadow');
                  if (shadowElement) {
                    shadowElement.style.display = 'none';
                  }
                }
              } else {
                const nav = document.querySelector('nav');
                if (nav) {
                  navHeight = nav.offsetHeight;
                  nav.style.display = 'none';
                  nav.style.boxShadow = 'none'; 
                  if (nav.id) {
                    const shadowElement = document.getElementById(nav.id + 'Shadow');
                    if (shadowElement) {
                      shadowElement.style.display = 'none';
                    }
                  }
                }
                else {
                  const divheader = document.querySelector('div#head, div#header');
                  if (divheader) {
                    divHeight = divheader.offsetHeight;
                    divheader.style.display = 'none';
                    divheader.style.boxShadow = 'none'; 
                    if (divheader.id) {
                      const shadowElement = document.getElementById(divheader.id + 'Shadow');
                      if (shadowElement) {
                        shadowElement.style.display = 'none';
                      }
                    }
                  }}}
              if (headerHeight == 0 && navHeight == 0 && divHeight == 0) {
                const divTopbar = document.querySelector('div#Topbar');
                if (divTopbar) {
                  divHeight = divTopbar.offsetHeight;
                  divTopbar.style.display = 'none';
                  divTopbar.style.boxShadow = 'none'; 
                  if (divTopbar.id) {
                    const shadowElement = document.getElementById(divTopbar.id + 'Shadow');
                    if (shadowElement) {
                      shadowElement.style.display = 'none';
                    }
                  }
                }
              }


              let newPageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
              let elementHeight = headerHeight || navHeight || divHeight || divTopbar;
              let heightReduced = initialPageHeight > newPageHeight;

              ({ elementHeight, heightReduced });
        `
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else {
          if (results && results[0]) {
            const { elementHeight, heightReduced } = results[0];
            if (!heightReduced) {
              resolve(0);
            }
            else {
              // console.debug('Element Height:', elementHeight, 'yOffset:', yOffset, 'Height Reduced:', heightReduced);
              resolve(elementHeight !== null ? elementHeight : 0);
            }
          } else {
            resolve(0);
          }
        }

      });
    });
  } else {
    return 0;
  }
}


// Function to capture the width of the screenshot
async function captureScreenshotWidth(tab: chrome.tabs.Tab): Promise<{ width: number, height: number }> {
  return new Promise<{ width: number, height: number }>((resolve, reject) => {
    // Capture the visible area of the tab as an image
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, async (dataUrl: string) => {
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to update MHTML content with Content-ID references
async function updateMHTMLWithContentID(mhtmlContent) {
  const boundary = "------MultipartBoundary--[A-Za-z0-9]{42}----\\s*";
  const contentIDMap = {};

  // Step 1: Find all css and create a map of their Content-IDs
  mhtmlContent = updateRelURls(boundary, mhtmlContent)

  // Step 1: Find all images and create a map of their Content-IDs
  const regex_images = `${boundary}Content-Type: image/(.*?)(Content-Location: (.*?)\\r?\\n)([\\s\\S]*?)(?=\\s*${boundary})`
  mhtmlContent = changeCID_Regex(boundary, mhtmlContent, contentIDMap, regex_images, 'image')
  // console.debug('Added Content-ID', contentIDMap);
  const regex_css = `${boundary}Content-Type: text/css(.*?)(Content-Location: (.*?)\\r?\\n)([\\s\\S]*?)(?=\\s*${boundary})`
  mhtmlContent = changeCID_Regex(boundary, mhtmlContent, contentIDMap, regex_css, 'css')
  
  // Step 2: Update the HTML part to use cid: references
  mhtmlContent = updateUrlCIDReference(boundary, mhtmlContent, contentIDMap)

  // return final mhtmlcontent
  return mhtmlContent
  }

function updateUrlCIDReference(boundary: string, mhtmlContent: any, contentIDMap: {}) {
  const htmlRegex = new RegExp(
    `${boundary}Content-Type: text/html([\\s\\S]*?)(?=\\s*${boundary})`, 'gs')

  let html_section = mhtmlContent.match(htmlRegex)[0]
  let html_updated = mhtmlContent.match(htmlRegex)[0]

  Object.keys(contentIDMap).forEach((imageUrl) => {
    let cidReference = `cid:${contentIDMap[imageUrl]}`
    const regex = new RegExp(adaptImageUrl(imageUrl), 'gs')
    const imageURL_inhtml = html_section.match(regex)
    if (imageURL_inhtml) {
      // check if = in imageURL_inhtml and add it into the cidReference
      if (imageURL_inhtml[0].includes('=') == true) {
        const equalPos = imageURL_inhtml[0].indexOf('=')
        if (equalPos < cidReference.length) {
          cidReference = cidReference.slice(0, equalPos) + '=\r\n' + cidReference.slice(equalPos)
        }
      }
      console.debug('Adapting URL in HTML:', imageURL_inhtml[0], cidReference);

      html_updated = html_updated.replace(imageURL_inhtml[0], cidReference)
    }
  })

  mhtmlContent = mhtmlContent.replace(html_section, html_updated)
  return mhtmlContent
}

function changeCID_Regex(boundary: string, mhtmlContent: any, contentIDMap: {}, regex_string: string, id_name:string) {
  // const imageRegex = new RegExp(
  //   `${boundary}Content-Type: image/(.*?)(Content-Location: (.*?)\\r?\\n)([\\s\\S]*?)(?=\\s*${boundary})`, 'gs'
  // )
  const imageRegex = new RegExp(
    regex_string, 'gs'
  )

  // console.debug('Image Regex:', imageRegex);
  let match
  let counter = 0

  while ((match = imageRegex.exec(mhtmlContent)) !== null) {
    // console.debug('Match:', match);
    if (!match[0].includes("Content-ID:")) { // match[0] is the whole match

      const imageUrl = match[3] // Content-Location: 

      // check if url is already a cid, then skip!
      if (imageUrl.includes('cid:')){
        continue
      }

      const contentID = id_name + `${counter++}` // Generate a unique Content-ID
      contentIDMap[imageUrl] = contentID

      // Add Content-ID to the image part,  Commnet Contennt-Location out (such that id uses the cid)      
      const updatedImagePart = '"' + match[2] + "Content-ID: <" + contentID + ">\r\n";
      // console.debug('update: \n', match[2], 'with\n', updatedImagePart)
      mhtmlContent = mhtmlContent.replace(match[2], updatedImagePart)
    }
  }
  return mhtmlContent
}

function updateRelURls(boundary: string, mhtmlContent: any) {
  // Get Snapshot URL
  const snapshot_url_regex = new RegExp(`(Snapshot-Content-Location: (.*?)\\r?\\n)`)
  const snapshotURL = mhtmlContent.match(snapshot_url_regex)[2]
  // console.debug('Snapshot URL:', snapshotURL)
  const domain_split = snapshotURL.split('/')
  const domain = domain_split[0] + '//' + domain_split[2]
  // console.debug('Domain:', domain)

  const boundaryRegexText = new RegExp(
    `${boundary}Content-Type: text/(.*?)(Content-Location: (.*?)\\r?\\n)([\\s\\S]*?)(?=\\s*${boundary})`, 'gs'
  )

  let match
  while ((match = boundaryRegexText.exec(mhtmlContent)) !== null) {
    // console.debug('Match:', match);
    let updated_match_0 = match[0]
    if (!match[0].includes("Content-ID:")) { // match[0] is the whole match
      // get BaseUrl
      let baseURL = match[3]
      // if Content location is a url (with http or https)
      if (baseURL.includes("http")) {
        const lastSegment = baseURL.substring(baseURL.lastIndexOf('/') + 1)
        if (lastSegment.includes('.')) {
          baseURL = baseURL.substring(0, baseURL.lastIndexOf('/') + 1)}}
      // else use the main url of the page
        else {
          baseURL = domain;
      }
      
      // get relURls 

      // Update relative urls: with url("...")
      updated_match_0 = changerelurl( 
        new RegExp(`u(=\\s*)?r(=\\s*)?l(=\\s*)?\\((=\\s*)?"([^"]*?)"(=\\s*)?\\)`, 'gs'), 
        5,
        baseURL, 
        updated_match_0,
        'url("...")');      

      if (updated_match_0 != match[0]) {
        mhtmlContent = mhtmlContent.replace(match[0], updated_match_0)
      }
    }}

    // Update relative urls: where href=3D"..."
    const boundaryRegexImage = new RegExp(
      `${boundary}Content-Type: image/(.*?)(Content-Location: (.*?)\\r?\\n)([\\s\\S]*?)(?=\\s*${boundary})`, 'gs'
    )  

    while ((match = boundaryRegexImage.exec(mhtmlContent)) !== null) {
      let updated_match_0 = match[0]
      if (!match[0].includes("Content-ID:")) { // match[0] is the whole match
        console.debug('Match image type:', match[1])
        if (match[1] == 'svg+xml') {
          console.debug(match[0])
        }
        // get BaseUrl
        let baseURL = match[3]
        // if Content location is a url (with http or https)
        if (baseURL.includes("http")) {
          const lastSegment = baseURL.substring(baseURL.lastIndexOf('/') + 1)
          if (lastSegment.includes('.')) {
            baseURL = baseURL.substring(0, baseURL.lastIndexOf('/') + 1)}}
        // else use the main url of the page
          else {
            baseURL = domain;
        }
  
      // Update relative urls: href=3D"..."
      console.debug('updating href=3D')
      updated_match_0 = changerelurl( 
        new RegExp(`h(=\\s*)?r(=\\s*)?e(=\\s*)?f(=\\s*)?=(=\\s*)?3(=\\s*)?D(=\\s*)?"([^"]*?)"`, 'gs'), 
        8,
        baseURL, 
        updated_match_0,
        'href=3D"..."');
      
      if (updated_match_0 != match[0]) {
        mhtmlContent = mhtmlContent.replace(match[0], updated_match_0)}
      }
    }

  return mhtmlContent
}

function changerelurl(relUrl_regex: RegExp, relUrlIndex: number, baseURL: string, updated_match_0: string, pattern: string) {
  let match_relUrl
  // console.debug(match_relUrl, Boolean(match_relUrl))
  // console.debug(relUrl_regex.exec(updated_match_0))

  while ((match_relUrl = relUrl_regex.exec(updated_match_0)) !== null) {
    // console.debug('Match rel URL:', match_relUrl)

    if (match_relUrl) {
      // console.debug('Match rel URL:', match_relUrl)
      const relURL = match_relUrl[relUrlIndex]
      // console.debug('Match rel URL:', relURL)
      // console.debug('Match rel URL:', relURL)
      if (!relURL.includes("http") && !relURL.includes("data:")) {
        let absURL = baseURL + relURL
        if (pattern == 'url("...")') {
          absURL = 'url("' + baseURL + relURL + '")'}

        else if (pattern == 'href=3D"..."') {
          absURL = 'href=3D"' + baseURL + relURL + '"'
        }

        updated_match_0 = updated_match_0.replace(new RegExp(match_relUrl[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), absURL)
        // mhtmlContent = mhtmlContent.replace(new RegExp(relURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), absURL);
        // console.debug('Updated rel URL Match:', relURL, absURL)
      }
    }
  }
  return updated_match_0
}


function escapeRegExp(string) {
  // Escape special regex characters
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function adaptImageUrl(imageUrl) {
  // Create a regex pattern that allows for `=` at any position
  const excaped_special = escapeRegExp(imageUrl)

  const addEqualEverywhere = excaped_special.split('').map((char) => {
    if (char !== '\\') {
      return `${char}(=\\s*)?`;
    }
    return char;
  }).join('');
  return `"${addEqualEverywhere}"`; // Allow for = or space
  // return addEqualEverywhere; // Allow for = or space
}