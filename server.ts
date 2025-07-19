import express, {Request, Response} from 'express';
import cookierParser from 'cookie-parser';
import * as fs from 'fs';
import cors from 'cors';
import ytSearch from 'yt-search'
import videos from './videos.json';

const app = express();
const redirect_uri = 'http://127.0.0.1:3000/callback';
const port = process.env.PORT || 3000;

const clientId = "40d8bc4e448d4ba49b0799093c8136b4";
const clientSecret = "f4dec0a27de64e939348691cacd17664";



interface SpotifyAccessTokenResponse {
    access_token: string,
    token_type: string,
    expires_in: number,
}


interface TrackInfo  {
  added_at: string;
  track: {
    name: string; // Song name
    external_urls: {
      spotify: string; // Song link
    };
    artists: {
      name: string; // Artist name
    }[];
    uri: string;
  };
};


app.use(cors({
    origin: 'http://127.0.0.1:5173',
    credentials: true,
}));


app.get('/', (req, res) => {
    res.send('<h1>test</h1>')
});




app.listen(port, () => {
    console.log(`Server is up on ${port}`);
});



const getSpotifyAccess = async () =>  {
    

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: "POST",
        headers: {
            'Content-type': "application/x-www-form-urlencoded",
            'Authorization': `Basic ${auth}`,
        },
        body: "grant_type=client_credentials&client_id=your-client-id&client_secret=your-client-secret",
    });

    const data: SpotifyAccessTokenResponse = await res.json();
    return data.access_token;
}




app.get("/token", async (req: Request, res: Response) => {
    try {
      const token = await getSpotifyAccess();
      res.send({access_token: token});
    } catch (error) {
        res.status(500).json({error: 'failed to get token'});
    }
});






app.get('/login', (req: Request, res: Response) => {
    const state = 'test';
    const scope = 'user-read-private user-read-email user-library-read playlist-read-private playlist-read-collaborative streaming';
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirect_uri,
        state: state,
        scope: scope,
    });

    res.redirect('https://accounts.spotify.com/authorize?' + params);
});


app.get('/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const params = new URLSearchParams({ error: 'state_mismatch'});

    if (state === null) {
        res.redirect('/#' + params);
    } else {

        const auth = await fetch('https://accounts.spotify.com/api/token', {
            method: "POST",
            body: new URLSearchParams({
                code,
                redirect_uri,
                grant_type: 'authorization_code',
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(`${clientId}:${clientSecret}`).toString('base64'))
            },
        });

        if (!auth.ok) {
            throw new Error(`token exchange failed ${auth.status}`);
        }


        const body = await auth.json();
        const access_token = body.access_token;
        const refresh_token = body.refresh_token;

        const params = new URLSearchParams({
            access_token,
            refresh_token,
        });

        res.cookie('access_token', access_token);
        res.cookie('refresh_token', refresh_token);
        res.redirect("http://127.0.0.1:5173");
    }
});

app.use(cookierParser());
app.get("/library", async (req: Request, res: Response) => {
    const token = req.cookies['access_token'];
   
    const params = new URLSearchParams({
        limit: '50',
        offset: '0',
        market: 'FR'
        
    });
    
    const response = await fetch(`https://api.spotify.com/v1/me/tracks?` + params, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token,
        },
    });

    var data = await response.json();
    // next page is data.next
    const allData: {items: TrackInfo[]}[] = [];
    while(data.next != null) {
        const response = await fetch(data.next, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
            },
        });
        
        allData.push(await data);
        data = await response.json();
    }
    console.log(allData)
    const allItems = allData.flatMap(page  => page.items.map(items => ({
        added_at: items.added_at,
        artist: items.track.artists[0].name,
        name: items.track.name,
        url: items.track.external_urls.spotify,
        uri: items.track.uri,
        
    })));

   
    res.send(allItems);

     fs.writeFile('videos.json', JSON.stringify(allItems,null, 2), (err) => {
            if(err) {
                console.error(err);
                throw err;
            }

            console.log('data written successfully');
        });
});



// app.get('/read', (req: Request, res: Response) => {
//     const file = "videos.json";
//     const test = fs.readFileSync(file, "utf-8");

//     const data: {items: TrackInfo[]}[] = JSON.parse(test);
//     const allItems = data.flatMap(page  => page.items.map(items => ({
//         added_at: items.added_at,
//         artist: items.track.artists[0].name,
//         name: items.track.name,
//         url: items.track.external_urls.spotify,
//     })));

//     data[0].items[0].track.name
//     data[0].items[0].track.artists[0].name
//     res.send(allItems[0]);


// });


const youtubeSearch = async (query: string) => {
    const res = await ytSearch(query);
    const video = res.videos[0];
    return video
}

app.get('/search', async (req: Request, res: Response) => {
    const video = req.query.video;
    console.log(req.query.video);
    if (video) {
        const ytVideo = await youtubeSearch(video.toString());
        res.send(ytVideo);
    } else {
        res.send(console.error);
    }
    
});


app.get('/playlist', (req: Request, res: Response) => {
    const playlist = [];
    const final = []
    const count = req.query.count;
    const max = req.query.max;

    if (typeof count === 'string' && typeof max === "string") {
        while (playlist.length < parseInt(count)) {
            const i = Math.floor(Math.random() * parseInt(max));
            if (playlist.indexOf(i) == -1) {
                playlist.push(i);
            }
        }
    } else {
        return res.status(400).send('Invalid or missing parameter');
    }
    
    for(let i = 0; i <= playlist.length; i++) {
        final.push(videos[playlist[i]]);
    }
    
    res.send(final);
});
    
    