
<link rel="preload" as="style" href="/stylesheets/landing/home.css"/>
<link rel="stylesheet" type="text/css" href="/stylesheets/landing/home.css"/>

<cfoutput>
<main>

	<section id="header">
		<h1 class="title center">Github ASCII Art</h1>

		<div>
			<div>
				<div class="flex-wrap">
					<div class="graphic">
						<svg width="828" height="128" class="js-calendar-graph-svg">
							<g transform="translate(10, 20)">

								<!--- loop over days and create g and rect tags here --->
								<cfloop index="i" from="1" to="#totalDays+1#">
									<cfset currentDow = dow[dateFormat(day, 'ddd')]/>

									<!--- start new week group --->
									<cfif currentDow EQ 0>
										<g transform="translate(#week*16#, 0)">
									</cfif>

									<rect width="11"
										height="11"
										x="#16-week#"
										y="#currentDow*15#"
										class="ContributionCalendar-day"
										rx="2" ry="2"
										<!--- data-count="#message[currentDow+1][week+1]#" --->
										data-count="#message[currentDow+1][(week%53)+1]#"
										data-date="#day#"
										data-level="0"
										title="#day#"></rect>

									<!--- finish week group --->
									<cfif currentDow EQ 6 OR i EQ totalDays+1>
										</g>
										<cfset week = week + 1/>
									</cfif>

									<cfset day = dateFormat(day+1, 'yyyy-mm-dd')/>
								</cfloop>

								<text x="16" y="-8" class="ContributionCalendar-label">Jan</text>
								<text x="61" y="-8" class="ContributionCalendar-label">Feb</text>
								<text x="121" y="-8" class="ContributionCalendar-label">Mar</text>
								<text x="181" y="-8" class="ContributionCalendar-label">Apr</text>
								<text x="241" y="-8" class="ContributionCalendar-label">May</text>
								<text x="316" y="-8" class="ContributionCalendar-label">Jun</text>
								<text x="376" y="-8" class="ContributionCalendar-label">Jul</text>
								<text x="436" y="-8" class="ContributionCalendar-label">Aug</text>
								<text x="511" y="-8" class="ContributionCalendar-label">Sep</text>
								<text x="571" y="-8" class="ContributionCalendar-label">Oct</text>
								<text x="646" y="-8" class="ContributionCalendar-label">Nov</text>
								<text x="706" y="-8" class="ContributionCalendar-label">Dec</text>
								<text x="766" y="-8" class="ContributionCalendar-label">Jan</text>

								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="8" style="display: none;">Sun</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="25">Mon</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="32" style="display: none;">Tue</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="56">Wed</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="57" style="display: none;">Thu</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="85">Fri</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="81" style="display: none;">Sat</text>
							</g>
						</svg>
				  </div>
				</div>
			</div>
		</div>
	</section>

	<br>

	<section id="my-process-so-far">
		<h2 class="title center">My Process So Far</h2>

		<br>
		<p>
			Step one was to recreate the graphic as a proof of concept and to test various dates to verify the logic
			behind the process. Most of the work done here will not be used in the finished product.
		</p>

		<br><br>

		<div>
			<div>
				<div class="flex-wrap">
					<div class="graphic">
						<svg width="828" height="128" class="js-calendar-graph-svg">
							<g transform="translate(10, 20)">

								<cfset day = firstSunday/>
								<cfset currentDow = 0/>
								<cfset week = 0/>
								<!--- loop over days and create g and rect tags here --->
								<cfloop index="i" from="1" to="#totalDays+1#">
									<cfset currentDow = dow[dateFormat(day, 'ddd')]/>

									<!--- start new week group --->
									<cfif currentDow EQ 0>
										<g transform="translate(#week*16#, 0)">
									</cfif>

									<rect width="11"
										height="11"
										x="#16-week#"
										y="#currentDow*15#"
										class="ContributionCalendar-day"
										rx="2" ry="2"
										<cfif day EQ projectStart>
											style="fill:red;"
										<cfelseif day EQ today>
											style="fill:blue;"
										<cfelseif i EQ 1>
											style="fill:green"
										<cfelse>
											data-count="0"
										</cfif>
										data-date="#day#"
										data-level="0"
										title="#day#"></rect>

									<!--- finish week group --->
									<cfif currentDow EQ 6 OR i EQ totalDays+1>
										</g>
										<cfset week = week + 1/>
									</cfif>

									<cfset day = dateFormat(day+1, 'yyyy-mm-dd')/>
								</cfloop>

								<text x="16" y="-8" class="ContributionCalendar-label">Jan</text>
								<text x="61" y="-8" class="ContributionCalendar-label">Feb</text>
								<text x="121" y="-8" class="ContributionCalendar-label">Mar</text>
								<text x="181" y="-8" class="ContributionCalendar-label">Apr</text>
								<text x="241" y="-8" class="ContributionCalendar-label">May</text>
								<text x="316" y="-8" class="ContributionCalendar-label">Jun</text>
								<text x="376" y="-8" class="ContributionCalendar-label">Jul</text>
								<text x="436" y="-8" class="ContributionCalendar-label">Aug</text>
								<text x="511" y="-8" class="ContributionCalendar-label">Sep</text>
								<text x="571" y="-8" class="ContributionCalendar-label">Oct</text>
								<text x="646" y="-8" class="ContributionCalendar-label">Nov</text>
								<text x="706" y="-8" class="ContributionCalendar-label">Dec</text>
								<text x="766" y="-8" class="ContributionCalendar-label">Jan</text>

								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="8" style="display: none;">Sun</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="25">Mon</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="32" style="display: none;">Tue</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="56">Wed</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="57" style="display: none;">Thu</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="85">Fri</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="81" style="display: none;">Sat</text>
							</g>
						</svg>
				  </div>
				</div>
			</div>
		</div>

		<br>
		<p>
			Define a start date for the project: <b style="color:red">#projectStart#</b>.
			This can be saved as an environment variable, within the controller, etc. This date will be used to
			begin writting our message "Hello, World!".
		</p>

		<br>
		<p>
			The Github graphic always starts each column with <b>Sunday</b>. So, starting from <b style="color:blue">today</b>,
			subtract 365 days and then find the previous Sunday. This will be the first rectangle in the github graphic and our
			<b style="color:green">origin point</b>. May also have to find the next Sunday if the previous results in more than
			53 weeks in the graphic.
		</p>

		<br>
		<p>
			The message is stored in an array of arrays mimicing the layout of the github graphic.
			Rows represent days of the week, and columns represent weeks in the year. There are 53 columns total.
			The first 52 columns represents the entire year prior to the current week, and the last possibly incomplete
			column represents the current week.
		</p>

		<!--- <br>
		<cfdump var="#message#"/> --->

		<br>
		<p>
			The days of the week (or rows) remain fixed, so we do not need to worry too much about that. However,
			since the weeks (columns) are constantly moving from right to left, we will have to do some work to
			determine our current week (column).
		</p>

		<br>
		<p>
			First try to simply calculate the week/day of week (column/row) by taking the difference between today
			and the starting date of your project. <br>
			Week Offset (column): <b><em>floor((today - projectStart) / 7)</b></em><br>
			Day of week (row): <b><em>currentDow</b></em>
		</p>

		<br><br>

		<div>
			<div>
				<div class="flex-wrap">
					<div class="graphic">
						<svg width="828" height="128" class="js-calendar-graph-svg">
							<g transform="translate(10, 20)">

								<cfset day = firstSunday/>
								<cfset currentDow = 0/>
								<cfset week = 0/>
								<!--- loop over days and create g and rect tags here --->
								<cfloop index="i" from="1" to="#totalDays+1#">
									<cfset currentDow = dow[dateFormat(day, 'ddd')]/>

									<!--- start new week group --->
									<cfif currentDow EQ 0>
										<g transform="translate(#week*16#, 0)">
									</cfif>

									<cfset row = currentDow + 1/>
									<cfset col = floor((day - projectStart)/7) + 1/>
									<!--- <cfset col = floor((day - projectStartSunday)/7) + 1/> --->
									<cfif col GT 0>
										<cfset commitValue = message[row][col]/>
									<cfelse>
										<cfset commitValue = 0/>
									</cfif>


									<rect width="11"
										height="11"
										x="#16-week#"
										y="#currentDow*15#"
										class="ContributionCalendar-day"
										rx="2" ry="2"
										<cfif day EQ projectStart>
											data-count="2"
										<cfelseif day EQ today>
											data-count="2"
										<cfelse>
											data-count="#commitValue#"
										</cfif>
										data-date="#day#"
										data-level="0"
										title="#day#"></rect>

									<!--- finish week group --->
									<cfif currentDow EQ 6 OR i EQ totalDays+1>
										</g>
										<cfset week = week + 1/>
									</cfif>

									<cfset day = dateFormat(day+1, 'yyyy-mm-dd')/>
								</cfloop>

								<text x="16" y="-8" class="ContributionCalendar-label">Jan</text>
								<text x="61" y="-8" class="ContributionCalendar-label">Feb</text>
								<text x="121" y="-8" class="ContributionCalendar-label">Mar</text>
								<text x="181" y="-8" class="ContributionCalendar-label">Apr</text>
								<text x="241" y="-8" class="ContributionCalendar-label">May</text>
								<text x="316" y="-8" class="ContributionCalendar-label">Jun</text>
								<text x="376" y="-8" class="ContributionCalendar-label">Jul</text>
								<text x="436" y="-8" class="ContributionCalendar-label">Aug</text>
								<text x="511" y="-8" class="ContributionCalendar-label">Sep</text>
								<text x="571" y="-8" class="ContributionCalendar-label">Oct</text>
								<text x="646" y="-8" class="ContributionCalendar-label">Nov</text>
								<text x="706" y="-8" class="ContributionCalendar-label">Dec</text>
								<text x="766" y="-8" class="ContributionCalendar-label">Jan</text>

								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="8" style="display: none;">Sun</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="25">Mon</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="32" style="display: none;">Tue</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="56">Wed</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="57" style="display: none;">Thu</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="85">Fri</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="81" style="display: none;">Sat</text>
							</g>
						</svg>
				  </div>
				</div>
			</div>
		</div>

		<br><br>

		<p>
			As you can see an error occurs. If we do not use the first element of the column (Sunday) as our reference point
			then when calculating which column (week) we are in we will get errors if a full 7 days has not passed. So, regardless
			of when you start your project, make sure you use the first sunday of that week as your reference.
		</p>

		<br><br>

		<div>
			<div>
				<div class="flex-wrap">
					<div class="graphic">
						<svg width="828" height="128" class="js-calendar-graph-svg">
							<g transform="translate(10, 20)">

								<cfset day = firstSunday/>
								<cfset currentDow = 0/>
								<cfset week = 0/>
								<!--- loop over days and create g and rect tags here --->
								<cfloop index="i" from="1" to="#totalDays+1#">
									<cfset currentDow = dow[dateFormat(day, 'ddd')]/>

									<!--- start new week group --->
									<cfif currentDow EQ 0>
										<g transform="translate(#week*16#, 0)">
									</cfif>

									<cfset row = currentDow + 1/>
									<cfset col = floor((day - projectStartSunday)/7) + 1/>
									<cfif col GT 0>
										<cfset commitValue = message[row][col]/>
									<cfelse>
										<cfset commitValue = 0/>
									</cfif>


									<rect width="11"
										height="11"
										x="#16-week#"
										y="#currentDow*15#"
										class="ContributionCalendar-day"
										rx="2" ry="2"
										<cfif day EQ projectStartSunday>
											data-count="2"
										<cfelseif day EQ today>
											data-count="2"
										<cfelse>
											data-count="#commitValue#"
										</cfif>
										data-date="#day#"
										data-level="0"
										title="#day#"></rect>

									<!--- finish week group --->
									<cfif currentDow EQ 6 OR i EQ totalDays+1>
										</g>
										<cfset week = week + 1/>
									</cfif>

									<cfset day = dateFormat(day+1, 'yyyy-mm-dd')/>
								</cfloop>

								<text x="16" y="-8" class="ContributionCalendar-label">Jan</text>
								<text x="61" y="-8" class="ContributionCalendar-label">Feb</text>
								<text x="121" y="-8" class="ContributionCalendar-label">Mar</text>
								<text x="181" y="-8" class="ContributionCalendar-label">Apr</text>
								<text x="241" y="-8" class="ContributionCalendar-label">May</text>
								<text x="316" y="-8" class="ContributionCalendar-label">Jun</text>
								<text x="376" y="-8" class="ContributionCalendar-label">Jul</text>
								<text x="436" y="-8" class="ContributionCalendar-label">Aug</text>
								<text x="511" y="-8" class="ContributionCalendar-label">Sep</text>
								<text x="571" y="-8" class="ContributionCalendar-label">Oct</text>
								<text x="646" y="-8" class="ContributionCalendar-label">Nov</text>
								<text x="706" y="-8" class="ContributionCalendar-label">Dec</text>
								<text x="766" y="-8" class="ContributionCalendar-label">Jan</text>

								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="8" style="display: none;">Sun</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="25">Mon</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="32" style="display: none;">Tue</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="56">Wed</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="57" style="display: none;">Thu</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="85">Fri</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="81" style="display: none;">Sat</text>
							</g>
						</svg>
				  </div>
				</div>
			</div>
		</div>

		<br><br>

		<cfset projectStart = dateFormat(now()-800, 'yyyy-mm-dd')/>
		<cfset projectStartOffset = dow[DateFormat(projectStart, 'ddd')]/>
		<cfset projectStartSunday = dateFormat(projectStart-projectStartOffset, 'yyyy-mm-dd')/>
		<!--- <cfdump var="#projectStart#"/> --->
		<p>
			Now, what if we have made it a whole year and still want the message to keep scrolling? Try setting the project
			start date to a long time ago, say 800 days before today: <b>#projectStart#</b>
		</p>

		<br>

		<p>
			Doing this will most likely result in an array index error. Our message array's rows are only length 53.
			In order to cycle through our message we will have to reset our week (column) value every 53 iterations.
		</p>

		<br><br>

		<div>
			<div>
				<div class="flex-wrap">
					<div class="graphic">
						<svg width="828" height="128" class="js-calendar-graph-svg">
							<g transform="translate(10, 20)">

								<cfset day = firstSunday/>
								<cfset currentDow = 0/>
								<cfset week = 0/>
								<!--- loop over days and create g and rect tags here --->
								<cfloop index="i" from="1" to="#totalDays+1#">
									<cfset currentDow = dow[dateFormat(day, 'ddd')]/>

									<!--- start new week group --->
									<cfif currentDow EQ 0>
										<g transform="translate(#week*16#, 0)">
									</cfif>

									<cfset row = currentDow + 1/>
									<cfset col = floor((day - projectStartSunday)/7)%53 + 1/>
									<cfif col GT 0>
										<cfset commitValue = message[row][col]/>
									<cfelse>
										<cfset commitValue = 0/>
									</cfif>


									<rect width="11"
										height="11"
										x="#16-week#"
										y="#currentDow*15#"
										class="ContributionCalendar-day"
										rx="2" ry="2"
										<cfif day EQ projectStartSunday>
											data-count="2"
										<cfelseif day EQ today>
											data-count="2"
										<cfelse>
											data-count="#commitValue#"
										</cfif>
										data-date="#day#"
										data-level="0"
										title="#day#"></rect>

									<!--- finish week group --->
									<cfif currentDow EQ 6 OR i EQ totalDays+1>
										</g>
										<cfset week = (week + 1) % 53/>
									</cfif>

									<cfset day = dateFormat(day+1, 'yyyy-mm-dd')/>
								</cfloop>

								<text x="16" y="-8" class="ContributionCalendar-label">Jan</text>
								<text x="61" y="-8" class="ContributionCalendar-label">Feb</text>
								<text x="121" y="-8" class="ContributionCalendar-label">Mar</text>
								<text x="181" y="-8" class="ContributionCalendar-label">Apr</text>
								<text x="241" y="-8" class="ContributionCalendar-label">May</text>
								<text x="316" y="-8" class="ContributionCalendar-label">Jun</text>
								<text x="376" y="-8" class="ContributionCalendar-label">Jul</text>
								<text x="436" y="-8" class="ContributionCalendar-label">Aug</text>
								<text x="511" y="-8" class="ContributionCalendar-label">Sep</text>
								<text x="571" y="-8" class="ContributionCalendar-label">Oct</text>
								<text x="646" y="-8" class="ContributionCalendar-label">Nov</text>
								<text x="706" y="-8" class="ContributionCalendar-label">Dec</text>
								<text x="766" y="-8" class="ContributionCalendar-label">Jan</text>

								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="8" style="display: none;">Sun</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="25">Mon</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="32" style="display: none;">Tue</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="56">Wed</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="57" style="display: none;">Thu</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="85">Fri</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="81" style="display: none;">Sat</text>
							</g>
						</svg>
				  </div>
				</div>
			</div>
		</div>

	</section>

	<br>

	<section id="automating-everything">
		<h3 class="title center">Automating Everything</h3>

		<br>
		<p>
			Now in practice, we aren't generating the entire svg image for ourselves like we did in the above demonstrations.
			This was simply to verify that the algorithm would work for various inputs. We only want to retrieve the
			value of our message array for the day (true or false), and use that to trigger a commit to our
			git repo or do nothing.
		</p>

		<br>
		<p>
			As you can see in the graphic above, today (the <span style="color:red">red</span> rect) is the only data point that
			we need to worry about. So using the method above we find the corresponding row and column values from our message
			array.
		</p>

		<br>
		<p>
			<b>row = current day of the week + 1</b><br>
			<b>col = (today - projectStartSunday) / 7) % 53 + 1</b><br>
		</p>

		<cfset projectStart = dateFormat(now()-30, 'yyyy-mm-dd')/>
		<cfset projectStartOffset = dow[DateFormat(projectStart, 'ddd')]/>
		<cfset projectStartSunday = dateFormat(projectStart-projectStartOffset, 'yyyy-mm-dd')/>

		<cfset currentDow = dow[dateFormat(today, 'ddd')]/>
		<cfset row = currentDow + 1/>
		<cfset col = floor((today - projectStartSunday)/7)%53 + 1/>
		<cfset commitValue = (col GT 0) ? message[row][col] : 0/>

		<br>
		<p>
			So let's say our project started on #projectStart#. That means for today (#today#) we need to retrieve
			the value from our message at row #row# and column #col#.<br>
			This value is
			<cfif message[row][col]>
				<b>TRUE</b>. So we need to make a commit today.
			<cfelse>
				<b>FALSE</b>. So we do not need to make a commit today.
			</cfif>
		</p>

		<br>
		<p>
			So once a day we need to determine if the message value is true, and if it is true then we need to alter
			a file so that there is something to commit. This can be very easily accompliched with &lt;cffile&gt; and
			&lt;cfschedule&gt;. Use &lt;cfschedule&gt; to create and run a scheduled task, and within that task use
			&lt;cffile&gt; to alter a text file with the current date if passed a value of true, or nothing if false.
		</p>

		<br>
		<p>
			Now all that is left to do is execute the git statements. Let's say we modified a text file named <em>"commit.txt"</em>.
			Then we can simply run: <br>
			<b>git add commit.txt</b><br>
			<b>git commit -m "daily hello git commit"</b><br>
			<b>git push</b>
		</p>

		<br>
		<p>
			...<br>
			But how do I do that with Lucee? This is where I am stuck...
		</p>
	</section>

</main>
</cfoutput>
