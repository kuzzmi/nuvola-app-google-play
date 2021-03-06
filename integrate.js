/*
 * Copyright 2011-2014 Jiří Janoušek <janousek.jiri@gmail.com>
 * Copyright 2014 Martin Pöhlmann <martin.deimos@gmx.de>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met: 
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer. 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution. 
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function(Nuvola)
{

var C_ = Nuvola.Translate.pgettext;
var ngettext = Nuvola.Translate.ngettext;

var State = Nuvola.PlaybackState;
var PlayerAction = Nuvola.PlayerAction;
var player = Nuvola.$object(Nuvola.MediaPlayer);

var ACTION_THUMBS_UP = "thumbs-up";
var ACTION_THUMBS_DOWN = "thumbs-down";
var ACTION_RATING = "rating";
var THUMBS_ACTIONS = [ACTION_THUMBS_UP, ACTION_THUMBS_DOWN];
var STARS_ACTIONS = [];
for (var i=0; i <= 5; i++)
    STARS_ACTIONS.push(ACTION_RATING + "::" + i);

var WebApp = Nuvola.$WebApp();

WebApp._onInitAppRunner = function(emitter)
{
    Nuvola.WebApp._onInitAppRunner.call(this, emitter);
    
    Nuvola.actions.addAction("playback", "win", ACTION_THUMBS_UP, C_("Action", "Thumbs up"), null, null, null, true);
    Nuvola.actions.addAction("playback", "win", ACTION_THUMBS_DOWN,C_("Action", "Thumbs down"), null, null, null, true);
    var ratingOptions = [];
    for (var stars = 0; stars < 6; stars++)
        ratingOptions.push([
            stars, // stateId, label, mnemo_label, icon, keybinding
            /// Star rating, {1} is a placeholder for a number 
            Nuvola.format(ngettext("Rating: {1} star", "Rating: {1} stars", stars), stars), // label
            null, // mnemo_label
            null, // icon
            null  // keybinding
            ]);
    Nuvola.actions.addRadioAction("playback", "win", ACTION_RATING, 0, ratingOptions);
}

WebApp._onInitWebWorker = function(emitter)
{
    Nuvola.WebApp._onInitWebWorker.call(this, emitter);
    
    Nuvola.actions.connect("ActionActivated", this);
    this.thumbsUp = undefined;
    this.thumbsDown = undefined;
    this.starRating = undefined;
    this.starRatingEnabled = undefined;
    this.thumbRatingEnabled = undefined;
    this.state = State.UNKNOWN;
    document.addEventListener("DOMContentLoaded", this._onPageReady.bind(this));
}

/**
 * Signal handler for @link{Core::UriChanged}
 */
WebApp._onUriChanged = function(emitter, uri)
{
    /* 
     * Users that use the queue page a lot might end up with it as a start-up page. However, this page is always empty
     * and not useful at all, so load Listen now page instead. https://bugs.launchpad.net/nuvola-player/+bug/1306678
     */
    if (uri === "https://play.google.com/music/listen#/ap/queue")
        uri = this.meta.home_url;
    
    Nuvola.WebApp._onUriChanged.call(this, emitter, uri);
}

WebApp._onPageReady = function()
{
    this.addNavigationButtons();
    this.update();
}

WebApp.update = function()
{
    var track = {};
    try
    {
        track.artLocation = document.getElementById('playingAlbumArt').src;
    }
    catch(e)
    {
        track.artLocation =  null;
    }
    
    try
    {
        var elm = document.getElementById('playerSongTitle').firstChild;
        track.title = elm.innerText || elm.textContent;
    }
    catch(e)
    {
        track.title = null;
    }
    
    try
    {
        var elm = document.getElementById('player-artist').firstChild;
        track.artist = elm.innerText || elm.textContent;
    }
    catch (e)
    {
        track.artist = null;
    }
    
    try
    {
        var elm = document.querySelector("#playerSongInfo .player-album");
        track.album = elm.innerText || elm.textContent;
    }
    catch (e)
    {
        track.album = null;
    }
    
    player.setTrack(track);
    
    this.state = State.UNKNOWN;
    var prevSong, nextSong, canPlay, canPause;
    try
    {
        var buttons = document.querySelector("#player .player-middle");
        var pp = buttons.childNodes[2];
        if (pp.disabled === true)
            this.state = State.UNKNOWN;
        else if (pp.className == "flat-button playing")
            this.state = State.PLAYING;
        else
            this.state = State.PAUSED;
        
        if (this.state !== State.UNKNOWN)
        {
            prevSong = buttons.childNodes[1].disabled === false;
            nextSong = buttons.childNodes[3].disabled === false;
        }
        else
        {
            prevSong = nextSong = false;
        }
    }
    catch (e)
    {
        prevSong = nextSong = false;
    }
    
    player.setPlaybackState(this.state);
    player.setCanPause(this.state === State.PLAYING);
    player.setCanPlay(this.state === State.PAUSED || this.state === State.UNKNOWN && this._luckyMix());
    player.setCanGoPrev(prevSong);
    player.setCanGoNext(nextSong);
    
    // Extract enabled flag and state from a web page
    var actionsEnabled = {};
    var actionsStates = {};
    try
    {
        actionsEnabled[ACTION_THUMBS_UP] = false;
        actionsEnabled[ACTION_THUMBS_DOWN] = false;
        var thumbs = this.getThumbs();
        if (thumbs[0].style.visibility !== "hidden")
        {
            this.toggleThumbRating(true);
            actionsStates[ACTION_THUMBS_UP] = thumbs[1].className === "selected";
            actionsStates[ACTION_THUMBS_DOWN] = thumbs[2].className === "selected";
            actionsEnabled[ACTION_THUMBS_UP] = true;
            actionsEnabled[ACTION_THUMBS_DOWN] = true;
        }
    }
    catch (e)
    {
    }
    try
    {
        actionsEnabled[ACTION_RATING] = false;
        var stars = this.getStars();
        if (stars.style.visibility !== "hidden")
        {
            this.toggleStarRating(true);
            actionsStates[ACTION_RATING] = stars.childNodes[0].getAttribute("data-rating") * 1;
            actionsEnabled[ACTION_RATING] = true;
        }
    }
    catch (e)
    {
    }
    
    // Compare with previous values and update if necessary
    Nuvola.actions.updateEnabledFlags(actionsEnabled);
    Nuvola.actions.updateStates(actionsStates);
    
    setTimeout(this.update.bind(this), 500);
}

WebApp.getPlayerButtons = function()
{
    var elm = document.querySelector("#player .player-middle");
    return elm ? elm.childNodes : null;
}

WebApp._onActionActivated = function(emitter, name, param)
{
    var buttons = this.getPlayerButtons();
    if (buttons)
    {
        var prev_song = buttons[1];
        var next_song = buttons[3];
        var play_pause = buttons[2];
    }
    else
    {
        var prev_song = null;
        var next_song = null;
        var play_pause = null;
    }
    
    switch (name)
    {
    /* Base media player actions */
    case PlayerAction.TOGGLE_PLAY:
        var luckyMix = this._luckyMix();
        if (this.state === State.UNKNOWN && luckyMix)
            Nuvola.clickOnElement(luckyMix);
        else
            Nuvola.clickOnElement(play_pause);
        break;
    case PlayerAction.PLAY:
        var luckyMix = this._luckyMix();
        if (this.state === State.UNKNOWN && luckyMix)
            Nuvola.clickOnElement(luckyMix);
        else if (this.state != State.PLAYING)
            Nuvola.clickOnElement(play_pause);
        break;
    case PlayerAction.PAUSE:
    case PlayerAction.STOP:
        if (this.state == State.PLAYING)
            Nuvola.clickOnElement(play_pause);
        break;
    case PlayerAction.PREV_SONG:
        if (prev_song)
            Nuvola.clickOnElement(prev_song);
        break;
    case PlayerAction.NEXT_SONG:
        if (next_song)
            Nuvola.clickOnElement(next_song);
        break;
    
    /* Custom actions */
    case ACTION_THUMBS_UP:
        Nuvola.clickOnElement(this.getThumbs()[1]);
        break;
    case ACTION_THUMBS_DOWN:
        Nuvola.clickOnElement(this.getThumbs()[2]);
        break;
    case ACTION_RATING:
        var stars = this.getStars().childNodes;
        var i = stars.length;
        while (i--)
        {
            var star = stars[i];
            if (star.getAttribute("data-rating") === ("" + param))
            {
                Nuvola.clickOnElement(star);
                break;
            }
        }
        break;
    }
}

WebApp.addNavigationButtons = function()
{
    /* Loading in progress? */
    var loading = document.getElementById("loading-progress");
    if (loading && loading.style.display != "none")
    {
        setTimeout(this.addNavigationButtons.bind(this), 250);
        return;
    }
    
    var queryBar = document.getElementById("gbq2");
    if (!queryBar)
    {
        console.log("Could not find the query bar.");
        return;
    }
    
    var queryBarFirstChild = queryBar.firstChild;
    
    var navigateBack = Nuvola.makeElement("button", null, "<");
    navigateBack.className = "button small vertical-align";
    navigateBack.style.float = "left";
    navigateBack.style.marginRight = "0px";
    navigateBack.style.borderTopRightRadius = "2px";
    navigateBack.style.borderBottomRightRadius = "2px";
    queryBar.insertBefore(navigateBack, queryBarFirstChild);
    
    var navigateForward = Nuvola.makeElement("button", null, ">");
    navigateForward.className = "button small vertical-align";
    navigateForward.style.float = "left";
    navigateForward.style.marginRight = "15px";
    navigateForward.style.borderLeft = "none";
    navigateForward.style.borderTopLeftRadius = "2px";
    navigateForward.style.borderLeftRightRadius = "2px";
    queryBar.insertBefore(navigateForward, queryBarFirstChild);
    
    Nuvola.actions.bindButton(navigateBack, Nuvola.BrowserAction.GO_BACK);
    Nuvola.actions.bindButton(navigateForward, Nuvola.BrowserAction.GO_FORWARD);
}

WebApp.getThumbs = function()
{
    var elm = document.querySelector("#player-right-wrapper .thumbs.rating-container");
    return [elm, elm.childNodes[0], elm.childNodes[1]];
}

WebApp.getStars = function()
{
    return document.querySelector("#player-right-wrapper .stars.rating-container");
}

WebApp.toggleStarRating = function(enabled)
{
    if (enabled && this.starRatingEnabled !== true)
    {
        player.addExtraActions(STARS_ACTIONS);
        this.starRatingEnabled = true;
    }
}

WebApp.toggleThumbRating = function(enabled)
{
    if (enabled && this.thumbRatingEnabled !== true)
    {
        player.addExtraActions(THUMBS_ACTIONS);
        this.thumbRatingEnabled = true;
    }
}

WebApp._luckyMix = function()
{
    return location.hash === "#/now" ? document.querySelector("div.ifl-group div.card[data-type=imfl] div.radio-icon") || false : false;
}

WebApp.start();

})(this);  // function(Nuvola)
