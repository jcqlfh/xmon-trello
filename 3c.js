// AUTH DATA
const key = "<KEY>";
const token = "<TOKEN>";

// URLS USED IN EXTENSION
const listBoardsUrl =
  "https://api.trello.com/1/members/me/boards?key=" + key + "&token=" + token;
const listListsUrl =
  "https://api.trello.com/1/boards/{idBoard}/lists?key=" +
  key +
  "&token=" +
  token;
const attachmentsUrl =
  "https://api.trello.com/1/cards/{id}/attachments?key=" +
  key +
  "&token=" +
  token;
const cardUrl = "https://api.trello.com/1/cards?key=" + key + "&token=" + token;

// HTML ELEMENTS
const getChamadoButton = document.getElementById("getChamado");
const titleHeader = document.getElementById("title");
const sendButton = document.getElementById("send");
const selectBoard = document.getElementById("board");
const selectList = document.getElementById("list");

// CHAMADO DATA
var chamado = "";
var description = "";
var files = [];

// TRELLO SETTINGS
var listOfBoards = [];
var listOfLists = [];
var selectedBoard;
var selectedList;

// CREATE AN OPTION FOR A SELECT
function createOption(parent, id, value) {
  var element = document.createElement("option");
  element.setAttribute("value", id);
  element.innerText = value;
  parent.appendChild(element);
}

// FUNCTION TO CLEAN THE STATE OF EXTENSION
async function cleanState() {
  await chrome.storage.local.set({
    chamado: "",
    description: "",
    attachments: [],
    boards: [...listOfBoards],
    lists: [...listOfLists],
    selectedBoard: selectBoard.value,
    selectedList: selectList.value,
  });

  chamado = "";
  description = "";
}

// FUNCTION TO GET CHAMADO DATA
async function getChamado() {
  try {
    console.log("getChamado");
    const chamado = document
      .getElementById("chamadosPropriedade")
      .getElementsByClassName("page-title-chamado")[0].innerText;
    const description = document.getElementById(
      "chamadosPropriedade"
    ).innerText;

    console.log(chamado);

    const xpathResult = document.evaluate(
      '//a[@title="Anexos"]',
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    console.log(xpathResult.snapshotLength);

    const attachments = [];

    for (let i = 0, length = xpathResult.snapshotLength; i < length; ++i) {
      console.log(xpathResult.snapshotItem(i));

      const rel = xpathResult.snapshotItem(i).getAttribute("rel");

      var attReq = new XMLHttpRequest();
      attReq.open(
        "GET",
        "https://helpdesk.santaclara.com.br/xmon" + rel,
        false
      );
      attReq.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
          // Typical action to be performed when the document is ready:
          var elements = JSON.parse(attReq.responseText);
          if (elements && elements.length > 0) {
            var div = document.createElement("div");
            div.innerHTML = elements[0].content;

            var atts = document.evaluate(
              "//table//a",
              div,
              null,
              XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
              null
            );
            for (let j = 0, lengthJ = atts.snapshotLength; j < lengthJ; ++j) {
              console.log(atts.snapshotItem(j));
              attachments.push(
                "https://helpdesk.santaclara.com.br/xmon/" +
                  atts.snapshotItem(j).getAttribute("href")
              );
            }
          }
        }
      };
      attReq.send();
    }

    var state = await chrome.storage.local.get();
    console.log(state);

    await chrome.storage.local.set({
      ...state,
      chamado: chamado,
      description: description,
      attachments: attachments,
    });
  } catch (e) {
    console.log(e);
    alert("nenhum chamado aberto");
  }
}

async function getChamadoButtonClick() {
  console.log("getChamadoButton");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: getChamado,
  });

  const data = await chrome.storage.local.get();
  chamado = data.chamado;
  description = data.description;
  attachments = data.attachments;

  var downloadedItems = [];
  await new Promise(async (resolve, reject) => {
    if (!attachments.length) resolve();

    for (var i = 0; i < attachments.length; i++) {
      var item = await chrome.downloads.download({ url: attachments[i] });
      downloadedItems.push(item);
    }
    resolve();
  });

  console.log(downloadedItems);
  files = [];

  for (var i = downloadedItems.length - 1; i >= 0; i--) {
    while (true) {
      var search = await chrome.downloads.search({ id: downloadedItems[i] });
      console.log(search);
      if (search.length > 0 && search[0].state == "complete") {
        console.log("complete");
        var url = search[0].finalUrl;
        console.log(url);
        await new Promise((res, rej) => {
          var rawFile = new XMLHttpRequest();
          rawFile.open("GET", url, true);
          rawFile.responseType = "arraybuffer";
          rawFile.onreadystatechange = function () {
            if (rawFile.readyState === 4) {
              if (rawFile.status === 200 || rawFile.status == 0) {
                console.log(search[0].filename);
                var names = search[0].filename.split("/");
                files.push({
                  name: names[names.length - 1],
                  file: new File(
                    [new Blob([rawFile.response], { type: search[0].mime })],
                    names[names.length - 1]
                  ),
                });
                res();
              }
            }
          };
          rawFile.send();
        });
        break;
      } else if (search.length > 0 && search[0].state == "interrupted") {
        console.log("Error while downloading the file");
        break;
      }
    }
  }
  titleHeader.innerText = data.chamado;
}

chrome.storage.local.get(async (state) => {
  listOfBoards = [];
  listOfLists = [];

  if (!state || !state.boards || state.boards.length == 0) {
    // GET ALL BOARDS
    await fetch(listBoardsUrl).then((response) =>
      response.json().then((data) =>
        data.forEach((item) => {
          if (!item.closed) {
            listOfBoards.push(item);
          }
        })
      )
    );
  } else {
    listOfBoards.push(...state.boards);
  }

  // FILL BOARDS SELECT
  listOfBoards.forEach((item) => {
    if (!item.closed) {
      createOption(selectBoard, item.id, item.name);
    }
  });

  if (state.selectedBoard) {
    // SET SELECTED BOARD VALUE
    selectBoard.value = state.selectedBoard;

    if (!state || !state.lists || state.lists.length == 0) {
      // GET ALL LISTS
      fetch(listListsUrl.replace("{idBoard}", state.selectedBoard)).then(
        (response) =>
          response.json().then((data) =>
            data.forEach((item) => {
              if (!item.closed) {
                listOfLists.push(item);
              }
            })
          )
      );
    } else {
      listOfLists.push(...state.lists);
    }

    // FILL LISTS SELECT
    listOfLists.forEach((item) => {
      if (!item.closed) {
        createOption(selectList, item.id, item.name);
      }
    });

    // SET SELECTED BOARD VALUE
    if (state.selectedList) selectList.value = state.selectedList;
  }
});

// SELECT BOARD CHANGE
selectBoard.addEventListener("change", async () => {
  if (selectBoard.value) {
    var options = selectList.getElementsByTagName("option");
    for (var i = options.length - 1; i >= 0; i--)
      if (options[i].value) options[i].remove();
    await fetch(listListsUrl.replace("{idBoard}", selectBoard.value)).then(
      (response) =>
        response.json().then((data) =>
          data.forEach((item) => {
            if (!item.closed) {
              listOfLists.push(item);
              createOption(selectList, item.id, item.name);
            }
          })
        )
    );
  }
});

// GET CHAMADO BUTTON CLICK
getChamadoButton.addEventListener("click", getChamadoButtonClick);

// SEND BUTTON CLICK
sendButton.addEventListener("click", async () => {
  if (selectList.value && chamado) {
    fetch(cardUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: chamado,
        desc: description,
        idList: selectList.value,
      }),
    })
      .then(async (response) => {
        var card = await response.json();
        alert("Card criado. Enviando anexos");
        console.log(files.length);
        files.forEach((file) => {
          var formData = new FormData();
          formData.append("name", file.name);
          formData.append("file", file.file);

          var request = new XMLHttpRequest();
          request.open("POST", attachmentsUrl.replace("{id}", card.id));
          request.send(formData);
        });
        alert("Anexos enviados");
      })
      .catch(() => alert("Erro ao criar card"));

    await cleanState();
  }
});
