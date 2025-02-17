function handleElementSelection(elemId: string, name?: string) {
  const groupName = name ? name : elemId

  const button = document.getElementById(elemId)
  if (button !== null) {
    button.onclick = () => {
      chrome.devtools.inspectedWindow.eval("console.log($0)")
      chrome.devtools.inspectedWindow.eval(`_injected.getElement($0, '${groupName}')`, { useContentScriptContext: true }, (result, info) => {
        console.log(result)
        console.info(info)
      })
    }
  }
}

handleElementSelection('maincontent')
handleElementSelection('nav')
handleElementSelection('header')
handleElementSelection('footer')
handleElementSelection('title')
handleElementSelection('advertisement')
handleElementSelection('image')

handleElementSelection('0')
handleElementSelection('1')
handleElementSelection('2')
handleElementSelection('3')
handleElementSelection('4')
handleElementSelection('5')
handleElementSelection('6')
handleElementSelection('7')


function panelMain() {
  const goToOptions = document.getElementById('goToOptions')!
  const userIdSpan = document.getElementById('userId')!
  const getUserId = document.getElementById("getUserId")!

  goToOptions.onclick = () => {
    chrome.runtime.openOptionsPage()
  }
  const checkUserId = () => {
    chrome.storage.sync.get('userId', items => {
      if (userIdSpan.textContent !== undefined)
        userIdSpan.textContent = items.userId;
    })
  }
  getUserId.onclick = checkUserId
  window.onload = checkUserId

  // Toggle layout functionality
  const toggleLayoutButton = document.getElementById('toggleLayout')!
  toggleLayoutButton.onclick = () => {
    const container = document.getElementById('segmentationContainer')!
    if (container.classList.contains('horizontal-layout')) {
      container.classList.remove('horizontal-layout')
      container.classList.add('vertical-layout')
    } else {
      container.classList.remove('vertical-layout')
      container.classList.add('horizontal-layout')
    }
  }
}

panelMain()
