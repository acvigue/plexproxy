const express = require('express')
const axios = require("axios").default
const qs = require("querystring")
const https = require("https");
const app = express()
var cors = require('cors')
app.use(cors())

const port = 8080
const global_serverID = process.env.PLEX_SERVER_ID;
const global_token = process.env.PLEX_SERVER_TOKEN;

//Plex client IDs that are allowed to access the protected library.
const clientIDWhitelist = (process.env.ALLOWED_CLIENTS || "").split(",");
const userID = process.env.ALLOWED_USER;

//Blocked library ID
const blockedLibrary = process.env.BLOCKED_LIBRARY;

//Internal accessable URL for accessing Plex from this proxy.
const originalURLBase = process.env.PLEX_HOST;

const agent = new https.Agent({  
  rejectUnauthorized: false
});

const plexHeaders = {
  "Accept": "*\/*",
  "accept-encoding": "gzip",
  "x-plex-token": global_token,
  'x-plex-client-identifier': global_serverID,
  "x-plex-provides": "server",
  "x-plex-version": "1.25.2.5319-c43dc0277",
  "user-agent": "PlexMediaServer/1.25.2.5319-c43dc0277"
}

app.get('/media/providers', async (req, res) => {
  let token = req.query["X-Plex-Token"] || req.headers["x-plex-token"] || "";
  let clientIdentifier = req.query["X-Plex-Client-Identifier"] || req.headers["x-plex-client-identifier"] || "";

  var tokenResp = "";
  try {
    tokenResp = (await axios.get(`https://plex.tv/users/account?X-Plex-Token=${token}`)).data
  } catch(e) {
    console.error("Unable to get Plex account associated with token :(");
  }

  var doFilter = true;
  if(tokenResp.indexOf(userID) != -1 && clientIDWhitelist.includes(clientIdentifier)) {
    doFilter = false;
  }

  console.log(`Got request for /media/providers. Filtering: ${doFilter}`);

  let q = qs.stringify(req.query);
  //console.log("input headers", req.headers);
  
  let responseMIME = req.headers.accept;
  //console.log("filter", doFilter);

  let newheaders = req.headers;
  newheaders["accept"] = "application/json";
  axios.get(`${originalURLBase}/media/providers?${q}`, {
	  headers: newheaders,
    httpsAgent: agent
  }).then((oResp) => {
    var newResp = oResp.data;
    //console.log("data in", newResp);
    try {
      if(doFilter) {
        const libraries = newResp.MediaContainer.MediaProvider[0].Feature[0].Directory;
        for(const i in libraries) {
          const library = libraries[i];
          if(typeof library.id != undefined) {
            if(library.id == blockedLibrary.toString()) {
              newResp.MediaContainer.MediaProvider[0].Feature[0].Directory.splice(i, 1);
            }
          }
        }
      }
      
      res.setHeader("x-plex-protocol", "1.0");
      if((responseMIME.indexOf("xml") != -1 || responseMIME.indexOf("*/*") != -1) && responseMIME.indexOf("application/json") == -1) {
        let xml = obj2xml(newResp, true);
        res.setHeader("Content-Type", "text/xml");
        //console.log("sending xml", xml);
        //console.log(xml);
        res.send(xml);
      } else {
        //console.log("sending json", newResp);
        res.send(newResp);
      }
    } catch(e) {
      console.log("request failed", e);
    }
  });
});

app.get('/hubs/search', async (req, res) => {
  let token = req.query["X-Plex-Token"] || req.headers["x-plex-token"] || "";
  let clientIdentifier = req.query["X-Plex-Client-Identifier"] || req.headers["x-plex-client-identifier"] || "";

  var tokenResp = "";
  try {
    tokenResp = (await axios.get(`https://plex.tv/users/account?X-Plex-Token=${token}`)).data;
  } catch(e) {
    console.error("Unable to get Plex account associated with token :(");
  }

  var doFilter = true;
  if(tokenResp.indexOf(userID) != -1 && clientIDWhitelist.includes(clientIdentifier)) {
    doFilter = false;
  }

  let q = qs.stringify(req.query);
  
  console.log(`Got request for /hubs/search. Filtering: ${doFilter}`);
  let newheaders = req.headers;
  let responseMIME = req.headers.accept;
  newheaders["accept"] = "application/json";
  axios.get(`${originalURLBase}/hubs/search?${q}`, {headers: newheaders, httpsAgent: agent}).then((oResp) => {
    var oData = oResp.data;

    var newData = {
      MediaContainer: {
        Hub: [],
        size: 0
      }
    }

    let hubs = oData.MediaContainer.Hub;
    for(let hubIndex = 0; hubIndex < hubs.length; hubIndex++) {
      let hub = hubs[hubIndex];
      if(hub.type == "actor" || hub.type == "director") {
        if(hub.size != 0) {
          let items = hub.Directory;
          let newItems = [];
          for(let itemIndex = 0; itemIndex < hub.size; itemIndex++) {
            let item = items[itemIndex];

            if((item.librarySectionID != blockedLibrary) || doFilter == false) {
              newItems.push(item);
            }
          }
          hub.Directory = newItems;
        }
      }

      if(hub.type == "movie") {
        if(hub.size != 0) {
          let items = hub.Metadata;
          let newItems = [];
          for(let itemIndex = 0; itemIndex < hub.size; itemIndex++) {
            let item = items[itemIndex];

            if((item.librarySectionID != blockedLibrary) || doFilter == false) {
              newItems.push(item);
            }
          }
          hub.Metadata = newItems;
        }
      }

      if(hub.type == "genre") {
        if(hub.size != 0) {
          let items = hub.Directory;
          let newItems = [];
          for(let itemIndex = 0; itemIndex < hub.size; itemIndex++) {
            let item = items[itemIndex];

            if((item.librarySectionID != blockedLibrary) || doFilter == false) {
              newItems.push(item);
            }
          }
          hub.Directory = newItems;
        }
      }

      newData.MediaContainer.Hub.push(hub);
    }
    newData.MediaContainer.size = newData.MediaContainer.Hub.length;

    res.setHeader("x-plex-protocol", "1.0");
    if((responseMIME.indexOf("xml") != -1 || responseMIME.indexOf("*/*") != -1)  && responseMIME.indexOf("application/json") == -1) {
      let xml = obj2xml(newData, true);
      res.setHeader("Content-Type", "text/xml");
      res.send(xml);
    } else {
      res.send(newData);
    }
  }).catch((err) => {
    console.error(err)
    res.status(500);
    res.send(err);
  })
})

function obj2xml(obj, sanitize) {
  const parser = require("xml2json");
  let xml = parser.toXml(JSON.stringify(obj), {
    sanitize: sanitize
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
}

function refreshConnectivityOptions(local, remote) {
  return new Promise(async (resolve, reject) => {
    let url = `https://plex.tv/devices/${global_serverID}?Connection[][uri]=${remote}&Connection[][uri]=${local}&httpsEnabled=1&httpsRequired=1&dnsRebindingProtection=0&X-Plex-Token=${global_token}`;
    await axios.put(url, null, {
      headers: plexHeaders
    });
    resolve()
  })
}

setInterval(async () => {
  await refreshConnectivityOptions(process.env.PLEX_LOCAL_URL, process.env.PLEX_REMOTE_URL);
}, 3600);

app.listen(port, () => {
  console.log(`PlexProxy active!`)

  refreshConnectivityOptions(process.env.PLEX_LOCAL_URL, process.env.PLEX_REMOTE_URL).then(() => {
    console.log("Connectivity refreshed!");
  });
})
